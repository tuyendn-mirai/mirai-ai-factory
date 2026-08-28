"""The tool-calling loop for on_message (requirement 6 + 7 tie-in).

Uses `cl.chat_context.to_openai()` for message history rather than a
hand-rolled list — Chainlit already maintains it correctly (including after
`edit_message`, which truncates chat_context before re-invoking on_message).
"""

from __future__ import annotations

import json
import logging

import chainlit as cl

from mirai_hub import llm_client, mcp_client
from mirai_hub.mcp_client import McpBinding
from mirai_hub.settings import settings

logger = logging.getLogger(__name__)


async def handle_user_message(message: cl.Message) -> None:
    binding: McpBinding | None = cl.user_session.get("mcp_binding")
    tools = binding.tools_openai if binding and binding.tools_openai else None
    model = cl.user_session.get("llm_model", settings.llm_model)
    history = cl.chat_context.to_openai()

    reply = cl.Message(content="")
    await reply.send()

    try:
        for round_no in range(settings.max_tool_roundtrips + 1):
            stream = await llm_client.get_client().chat.completions.create(
                model=model,
                messages=history,
                tools=tools,
                stream=True,
            )

            text_parts: list[str] = []
            tool_calls: dict[int, dict] = {}
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta.content:
                    text_parts.append(delta.content)
                    await reply.stream_token(delta.content)
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

            if not tool_calls:
                break  # final answer already streamed to `reply`

            history.append(
                {
                    "role": "assistant",
                    "content": "".join(text_parts) or None,
                    "tool_calls": [
                        {
                            "id": call["id"],
                            "type": "function",
                            "function": {"name": call["name"], "arguments": call["arguments"]},
                        }
                        for call in tool_calls.values()
                    ],
                }
            )

            if round_no == settings.max_tool_roundtrips:
                await reply.stream_token("\n\n_(Stopped: reached the max tool-call round trips.)_")
                break

            step_name = binding.project_name if binding else "tool"
            async with cl.Step(name=step_name, type="tool") as step:
                step.input = json.dumps([call["name"] for call in tool_calls.values()])
                outputs = []
                for call in tool_calls.values():
                    if binding is None:
                        result_text = "Error: no MCP server connected for this thread."
                    else:
                        try:
                            arguments = json.loads(call["arguments"] or "{}")
                            result_text = await mcp_client.call_tool(binding, call["name"], arguments)
                        except Exception as exc:  # noqa: BLE001 - surfaced to the model, not swallowed
                            logger.exception("MCP tool call failed: %s", call["name"])
                            result_text = f"Error calling tool {call['name']}: {exc}"
                    outputs.append(result_text)
                    history.append(
                        {"role": "tool", "tool_call_id": call["id"], "content": result_text}
                    )
                step.output = "\n\n".join(outputs)
            # loop back and let the model react to the tool results
    except Exception as exc:  # noqa: BLE001 - end every failure path in a normal chat message
        logger.exception("Chat turn failed")
        await reply.stream_token(f"\n\n_(Something went wrong: {exc})_")
    finally:
        await reply.update()
