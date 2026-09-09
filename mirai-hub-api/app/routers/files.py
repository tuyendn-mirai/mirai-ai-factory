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
import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from app import storage
from app.db import elements as elements_db
from app.db import steps as steps_db
from app.db import threads as threads_db
from app.deps import CurrentUser, get_current_user, get_db_pool
from app.langflow_client import auth_headers
from app.settings import settings

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


# Extension -> real Content-Type for a Langflow-generated audio reply (e.g.
# voice_ticket_triage_mcp's TTS output). Deliberately small — this route
# only ever proxies files our own flows produce.
_AUDIO_CONTENT_TYPES = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "ogg": "audio/ogg",
    "m4a": "audio/mp4",
    "flac": "audio/flac",
}


@router.get("/files/tool-audio/{flow_id}/{file_name}")
async def get_tool_audio(
    flow_id: str, file_name: str, user: CurrentUser = Depends(get_current_user)
) -> Response:
    """Proxy a Langflow-generated audio reply so the browser can play it inline.

    Pointing <audio src> straight at Langflow's own
    GET /api/v1/files/download/{flow_id}/{file_name} fails two ways at once
    (verified live against this deployment's Langflow 1.12.0):
    1. That route requires Langflow's own auth (`Depends(get_flow)`) - a
       mirai-hub-web browser session has no Langflow credentials, so it's a
       403 "No authentication credentials provided".
    2. Even authenticated (e.g. curl with ?x-api-key=), the response always
       carries `Content-Type: application/octet-stream` regardless of the
       file's real type - langflow-ai/langflow's api/v1/files.py computes the
       correct type via build_content_type_from_extension but then hardcodes
       "Content-Type": "application/octet-stream" in the headers dict passed
       to StreamingResponse, which wins over the media_type argument. Browsers
       generally refuse to play a non-audio/* resource through <audio>.

    This route authenticates server-side (same x-api-key already used for
    the MCP connection, app.langflow_client.auth_headers) and re-serves the
    bytes with a real audio/* Content-Type inferred from the extension -
    chat_loop.py rewrites the flow's raw download link to point here instead.

    Reachable via langflow_runtime_base_url specifically because that's the
    backend mirai-hub's MCP connection actually runs flows through - but the
    generated file itself lives on langflow-shared-data, the PVC langflow-ide
    and langflow-runtime both mount (verified: same file present on both
    pods), so either backend's Files API would serve it identically.
    """
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    content_type = _AUDIO_CONTENT_TYPES.get(ext)
    if content_type is None:
        raise HTTPException(status_code=404, detail="not a recognized audio file")

    url = f"{settings.langflow_runtime_base_url}/api/v1/files/download/{flow_id}/{file_name}"
    async with httpx.AsyncClient(timeout=30) as client:
        upstream = await client.get(url, headers=auth_headers())
    if upstream.status_code != 200:
        raise HTTPException(status_code=502, detail="failed to fetch audio from Langflow")

    return Response(content=upstream.content, media_type=content_type)
