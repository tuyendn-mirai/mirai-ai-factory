"""POST /api/uploads/presign and POST /api/threads/{id}/files/confirm.

Presigned S3 PUT (not proxied through the backend) — the browser uploads
directly to MinIO, then confirms so this API can record the `Element` row.
See app/db/elements.py for the placeholder-Step judgment call this needs
because `"Element"."stepId"` is `NOT NULL` but no `Step` exists yet at
upload time.
"""

from __future__ import annotations

import uuid

import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import storage
from app.db import elements as elements_db
from app.db import steps as steps_db
from app.db import threads as threads_db
from app.deps import CurrentUser, get_current_user, get_db_pool

router = APIRouter(tags=["files"])


class PresignRequest(BaseModel):
    filename: str
    mime: str


@router.post("/uploads/presign")
async def presign_upload(
    body: PresignRequest, user: CurrentUser = Depends(get_current_user)
) -> dict:
    element_id = str(uuid.uuid4())
    object_key = f"uploads/{element_id}/{body.filename}"
    upload_url = storage.presign_put(object_key, body.mime)
    return {"uploadUrl": upload_url, "elementId": element_id, "objectKey": object_key}


class ConfirmRequest(BaseModel):
    objectKey: str
    name: str
    mime: str | None = None
    size: int | None = None


@router.post("/threads/{thread_id}/files/confirm")
async def confirm_upload(
    thread_id: str,
    body: ConfirmRequest,
    pool: asyncpg.Pool = Depends(get_db_pool),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    thread = await threads_db.get_thread_row(pool, thread_id)
    if thread is None or thread["userId"] != user.id:
        raise HTTPException(status_code=404, detail="thread not found")

    placeholder_step_id = await steps_db.append_step(
        pool,
        thread_id=thread_id,
        type_="undefined",
        name="pending_upload",
        metadata={"pending_upload": True},
    )
    element_id = await elements_db.create_element(
        pool,
        thread_id=thread_id,
        step_id=placeholder_step_id,
        name=body.name,
        mime=body.mime,
        object_key=body.objectKey,
        size=body.size,
    )
    return {"elementId": element_id}
