"""POST /api/threads/{id}/messages (SSE) and POST /api/threads/{id}/stop.

The turn (`app.chat_loop.run_turn`) runs as a background `asyncio.Task`
feeding an `asyncio.Queue`, consumed here by an `sse-starlette`
`EventSourceResponse` — so a client disconnect doesn't kill an in-flight
tool call; only an explicit `/stop` (or the task finishing) does.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app import chat_loop
from app.db import threads as threads_db
from app.deps import CurrentUser, get_current_user, get_db_pool
from app.mcp_registry import registry
from app.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/threads", tags=["chat"])

# thread_id -> in-flight generation task, so /stop can cancel it. Module-
# level like app.mcp_registry's binding dict, for the same reason: there's
# no per-connection session object to hang this off of anymore.
_active_tasks: dict[str, asyncio.Task] = {}


class Attachment(BaseModel):
    elementId: str


class MessageRequest(BaseModel):
    content: str
    attachments: list[Attachment] = []


@router.post("/{thread_id}/messages")
async def post_message(
    thread_id: str,
    body: MessageRequest,
    pool: asyncpg.Pool = Depends(get_db_pool),
    user: CurrentUser = Depends(get_current_user),
) -> EventSourceResponse:
    thread = await threads_db.get_thread_row(pool, thread_id)
    if thread is None or thread["userId"] != user.id:
        raise HTTPException(status_code=404, detail="thread not found")

    existing = _active_tasks.get(thread_id)
    if existing and not existing.done():
        raise HTTPException(status_code=409, detail="a generation is already in progress for this thread")

    metadata = thread["metadata"] or {}
    model = metadata.get("llmModel") or settings.llm_model
    binding = await registry.get(thread_id)

    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    async def _worker() -> None:
        try:
            async for event in chat_loop.run_turn(
                pool,
                thread_id,
                content=body.content,
                attachment_element_ids=[a.elementId for a in body.attachments],
                model=model,
                binding=binding,
            ):
                await queue.put({"event": event.event, "data": json.dumps(event.data)})
        except asyncio.CancelledError:
            await queue.put({"event": "error", "data": json.dumps({"message": "stopped"})})
        except Exception as exc:
            logger.exception("Unhandled error running chat turn for thread %s", thread_id)
            await queue.put({"event": "error", "data": json.dumps({"message": str(exc)})})
        finally:
            await threads_db.touch_thread(pool, thread_id)
            await queue.put(None)
            _active_tasks.pop(thread_id, None)

    task = asyncio.create_task(_worker())
    _active_tasks[thread_id] = task

    async def _event_stream():
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item

    return EventSourceResponse(_event_stream())


@router.post("/{thread_id}/stop")
async def stop_generation(
    thread_id: str,
    pool: asyncpg.Pool = Depends(get_db_pool),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    thread = await threads_db.get_thread_row(pool, thread_id)
    if thread is None or thread["userId"] != user.id:
        raise HTTPException(status_code=404, detail="thread not found")

    task = _active_tasks.get(thread_id)
    if task and not task.done():
        task.cancel()
        return {"stopped": True}
    return {"stopped": False}
