"""Raw asyncpg queries against `"Step"` — see scripts/init_schema.py for the
exact schema, including the `"StepType"` enum (`user_message` /
`assistant_message` / `tool` / `undefined` / ...), which is the ground truth
this module is written against.

Convention used here (this app owns both ends, so it's free to pick one,
unlike the Chainlit build which had to match `ChainlitDataLayer`'s own
convention): the human-readable text of every step — the user's message, the
assistant's reply, a tool's result — lives in `"output"`. `"input"` is only
used for a tool step's call arguments (handy for inspection/debugging in the
DB), and a tool call's id / a tool step's timing live in `"metadata"` since
there's no dedicated column for either.
"""

from __future__ import annotations

from typing import Any

import asyncpg

from app.db import elements as elements_db


async def append_step(
    pool: asyncpg.Pool,
    *,
    thread_id: str,
    type_: str,
    name: str | None = None,
    input_: str | None = None,
    output: str | None = None,
    metadata: dict[str, Any] | None = None,
    parent_id: str | None = None,
    is_error: bool = False,
) -> str:
    row = await pool.fetchrow(
        """INSERT INTO "Step"
               ("threadId", "parentId", "input", "metadata", "name", "output", "type",
                "isError", "startTime", "endTime")
           VALUES ($1, $2, $3, $4, $5, $6, $7::"StepType", $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING "id\"""",
        thread_id,
        parent_id,
        input_,
        metadata or {},
        name,
        output,
        type_,
        is_error,
    )
    assert row is not None
    return row["id"]


async def update_step_output(
    pool: asyncpg.Pool, step_id: str, *, output: str, is_error: bool = False
) -> None:
    await pool.execute(
        """UPDATE "Step" SET "output" = $2, "isError" = $3, "endTime" = CURRENT_TIMESTAMP
           WHERE "id" = $1""",
        step_id,
        output,
        is_error,
    )


async def list_steps(pool: asyncpg.Pool, thread_id: str) -> list[asyncpg.Record]:
    return await pool.fetch(
        """SELECT * FROM "Step" WHERE "threadId" = $1
           ORDER BY "startTime" ASC, "createdAt" ASC""",
        thread_id,
    )


async def history_as_openai_messages(pool: asyncpg.Pool, thread_id: str) -> list[dict[str, Any]]:
    """Rebuild OpenAI-format chat history from persisted Steps — this app's
    equivalent of the old Chainlit build's `cl.chat_context.to_openai()`.
    """
    steps = await list_steps(pool, thread_id)
    messages: list[dict[str, Any]] = []
    for step in steps:
        step_type = step["type"]
        metadata = step["metadata"] or {}
        if step_type == "user_message":
            messages.append({"role": "user", "content": step["output"] or ""})
        elif step_type == "assistant_message":
            message: dict[str, Any] = {"role": "assistant", "content": step["output"] or None}
            tool_calls = metadata.get("tool_calls")
            if tool_calls:
                message["tool_calls"] = tool_calls
            messages.append(message)
        elif step_type == "tool":
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": metadata.get("tool_call_id", ""),
                    "content": step["output"] or "",
                }
            )
        # other types ("undefined" pending-upload placeholders, etc.) carry
        # no chat-turn content and are skipped.
    return messages


async def steps_for_thread_api(pool: asyncpg.Pool, thread_id: str) -> list[dict[str, Any]]:
    """Shape Steps (+ their attached Elements) for `GET /api/threads/{id}`'s
    `messages` field.
    """
    steps = await list_steps(pool, thread_id)
    elements = await elements_db.list_for_thread(pool, thread_id)
    elements_by_step: dict[str, list[dict[str, Any]]] = {}
    for element in elements:
        elements_by_step.setdefault(element["stepId"], []).append(
            {
                "elementId": element["id"],
                "name": element["name"],
                "mime": element["mime"],
                "objectKey": element["objectKey"],
            }
        )

    result: list[dict[str, Any]] = []
    for step in steps:
        if step["type"] == "undefined":
            continue  # pending-upload placeholders — not a real chat message
        result.append(
            {
                "id": step["id"],
                "type": step["type"],
                "name": step["name"],
                "input": step["input"],
                "output": step["output"],
                "isError": step["isError"],
                "createdAt": step["createdAt"].isoformat(),
                "attachments": elements_by_step.get(step["id"], []),
            }
        )
    return result
