"""The tool-calling loop, refactored from mirai_hub/chat.py.

Keeps the exact same round-trip shape as the old Chainlit build (stream
deltas -> accumulate tool_calls -> `mcp_client.call_tool` -> loop, capped at
`settings.max_tool_roundtrips`), but:

- I/O is a Postgres `Step` per turn (persisted as it happens, not only at
  the end) instead of `cl.Message.stream_token` / `cl.Step`.
- History is rebuilt from the DB via `db.steps.history_as_openai_messages`
  instead of `cl.chat_context.to_openai()`.
- Output is an `AsyncIterator[Event]` consumed by `app/routers/chat.py`,
  which pushes each event into an `asyncio.Queue` for an `EventSourceResponse`
  rather than writing directly to a Chainlit UI.
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import asyncpg

from app import llm_client, mcp_client, storage
from app.db import elements as elements_db
from app.db import steps as steps_db
from app.mcp_client import McpBinding
from app.settings import settings

logger = logging.getLogger(__name__)

# Matches the markdown link a Langflow TTS component (e.g. voice_ticket_triage_mcp's
# litellm_text_to_speech.py) emits: "[Download audio](http://<any-langflow-host>/api/v1/files/download/<flow_id>/<file>.<ext>)".
_LANGFLOW_AUDIO_LINK_RE = re.compile(
    r"https?://[^\s)]+/api/v1/files/download/([^/\s)]+)/([^/\s)]+\.(?:mp3|wav|ogg|m4a|flac))"
)


def _rewrite_langflow_audio_links(text: str) -> str:
    """Rewrite a Langflow file-download URL to this app's own audio proxy.

    A raw Langflow download link is unplayable straight from the browser —
    see app/routers/files.py's get_tool_audio for the two stacked reasons
    (Langflow's own auth, and a hardcoded response Content-Type). Rewriting
    here (once, before the tool result is persisted or streamed) means every
    consumer — the DB, the SSE event, any later re-render — sees the already-
    fixed link; no client-side special-casing needed beyond recognizing an
    audio-extension URL as playable (mirai-hub-web/src/components/chat/Markdown.tsx).
    """
    return _LANGFLOW_AUDIO_LINK_RE.sub(r"/api/files/tool-audio/\1/\2", text)


@dataclass
class Event:
    event: str
    data: dict[str, Any]


async def run_turn(
    pool: asyncpg.Pool,
    thread_id: str,
    *,
    content: str,
    attachment_element_ids: list[str],
    model: str,
    binding: McpBinding | None,
) -> AsyncIterator[Event]:
    user_step_id = await steps_db.append_step(
        pool, thread_id=thread_id, type_="user_message", name="user", output=content
    )
    for element_id in attachment_element_ids:
        await elements_db.reassign_step(pool, element_id, user_step_id)

    history = await steps_db.history_as_openai_messages(pool, thread_id)
    tools = binding.tools_openai if binding and binding.tools_openai else None

    # Audio attachments: give the model a fetchable URL for this turn only —
    # NOT persisted (history is rebuilt from the DB on every call, and this
    # note is appended to the in-memory copy after that rebuild), because a
    # presigned URL expires (storage.PRESIGN_EXPIRES_SECONDS) and replaying an
    # expired one on a later turn would just fail. Without this, an MCP tool
    # bound to the thread (e.g. a Langflow flow expecting an `audio_url`
    # argument) has no way to learn the file exists — chat_loop previously
    # never surfaced attachment content to the model at all.
    audio_notes: list[str] = []
    for element_id in attachment_element_ids:
        element = await elements_db.get(pool, element_id)
        if element is None or not (element["mime"] or "").startswith("audio/"):
            continue
        url = storage.presign_get(element["objectKey"])
        audio_notes.append(f"[audio attachment: name={element['name']} url={url}]")
    if audio_notes and history and history[-1].get("role") == "user":
        history[-1]["content"] = (history[-1]["content"] or "") + "\n\n" + "\n".join(audio_notes)

    try:
        for round_no in range(settings.max_tool_roundtrips + 1):
            stream = await llm_client.get_client().chat.completions.create(
                model=model,
                messages=history,
                tools=tools,
                stream=True,
            )

            text_parts: list[str] = []
            tool_calls: dict[int, dict[str, str]] = {}
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta.content:
                    text_parts.append(delta.content)
                    yield Event("token", {"delta": delta.content})
                for call_delta in delta.tool_calls or []:
                    slot = tool_calls.setdefault(
                        call_delta.index, {"id": "", "name": "", "arguments": ""}
                    )
                    if call_delta.id:
                        slot["id"] = call_delta.id
                    if call_delta.function and call_delta.function.name:
                        slot["name"] = call_delta.function.name
                    if call_delta.function and call_delta.function.arguments:
                        slot["arguments"] += call_delta.function.arguments

            assistant_text = "".join(text_parts)

            if not tool_calls:
                assistant_step_id = await steps_db.append_step(
                    pool,
                    thread_id=thread_id,
                    type_="assistant_message",
                    name="assistant",
                    output=assistant_text,
                )
                yield Event("message_done", {"assistantStepId": assistant_step_id})
                return  # final answer already streamed as token events

            openai_tool_calls = [
                {
                    "id": call["id"],
                    "type": "function",
                    "function": {"name": call["name"], "arguments": call["arguments"]},
                }
                for call in tool_calls.values()
            ]
            history.append(
                {"role": "assistant", "content": assistant_text or None, "tool_calls": openai_tool_calls}
            )
            assistant_step_id = await steps_db.append_step(
                pool,
                thread_id=thread_id,
                type_="assistant_message",
                name="assistant",
                output=assistant_text,
                metadata={"tool_calls": openai_tool_calls},
            )

            if round_no == settings.max_tool_roundtrips:
                note = "\n\n_(Stopped: reached the max tool-call round trips.)_"
                yield Event("token", {"delta": note})
                await steps_db.update_step_output(pool, assistant_step_id, output=assistant_text + note)
                yield Event("message_done", {"assistantStepId": assistant_step_id})
                return

            for call in tool_calls.values():
                yield Event("tool_start", {"name": call["name"], "args": call["arguments"]})
                started = time.monotonic()
                tool_is_error = False
                if binding is None:
                    tool_is_error = True
                    result_text = "Error: no MCP server connected for this thread."
                else:
                    try:
                        arguments = json.loads(call["arguments"] or "{}")
                        result_text = await mcp_client.call_tool(binding, call["name"], arguments)
                        result_text = _rewrite_langflow_audio_links(result_text)
                        tool_is_error = result_text.startswith("Error")
                    except Exception as exc:
                        logger.exception("MCP tool call failed: %s", call["name"])
                        result_text = f"Error calling tool {call['name']}: {exc}"
                        tool_is_error = True
                duration_ms = int((time.monotonic() - started) * 1000)

                history.append({"role": "tool", "tool_call_id": call["id"], "content": result_text})
                await steps_db.append_step(
                    pool,
                    thread_id=thread_id,
                    type_="tool",
                    name=call["name"],
                    input_=call["arguments"],
                    output=result_text,
                    metadata={"tool_call_id": call["id"], "durationMs": duration_ms},
                    parent_id=assistant_step_id,
                    is_error=tool_is_error,
                )
                yield Event(
                    "tool_end", {"name": call["name"], "result": result_text, "durationMs": duration_ms}
                )
            # loop back and let the model react to the tool results
    except Exception as exc:
        logger.exception("Chat turn failed for thread %s", thread_id)
        yield Event("error", {"message": str(exc)})
