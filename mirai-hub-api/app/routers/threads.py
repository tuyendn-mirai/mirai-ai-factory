"""GET/POST /api/threads, GET/PATCH/DELETE /api/threads/{id},
POST /api/threads/{id}/mcp.

`POST /api/threads/{id}/stop` lives in routers/chat.py next to the
generation task registry it cancels.
"""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import langflow_client, mcp_client
from app.db import steps as steps_db
from app.db import threads as threads_db
from app.deps import CurrentUser, get_current_user, get_db_pool
from app.mcp_registry import registry
from app.settings import settings

router = APIRouter(prefix="/threads", tags=["threads"])


async def _get_owned_thread(pool: asyncpg.Pool, thread_id: str, user: CurrentUser) -> asyncpg.Record:
    thread = await threads_db.get_thread_row(pool, thread_id)
    if thread is None or thread["userId"] != user.id:
        raise HTTPException(status_code=404, detail="thread not found")
    return thread


@router.get("")
async def list_threads(
    pool: asyncpg.Pool = Depends(get_db_pool), user: CurrentUser = Depends(get_current_user)
) -> list[dict]:
    return await threads_db.list_threads(pool, user.id)


@router.post("")
async def create_thread(
    pool: asyncpg.Pool = Depends(get_db_pool), user: CurrentUser = Depends(get_current_user)
) -> dict:
    thread_id = await threads_db.create_thread(pool, user.id)
    return {"id": thread_id}


@router.get("/{thread_id}")
async def get_thread(
    thread_id: str,
    pool: asyncpg.Pool = Depends(get_db_pool),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    thread = await _get_owned_thread(pool, thread_id, user)
    messages = await steps_db.steps_for_thread_api(pool, thread_id)
    metadata = thread["metadata"] or {}
    binding = await registry.get(thread_id)
    return {
        "id": thread["id"],
        "name": thread["name"],
        "messages": messages,
        "mcpConnected": binding is not None,
        "mcpProjectId": metadata.get("mcp_project_id"),
        "mcpProjectName": metadata.get("mcp_project_name"),
        "llmModel": metadata.get("llmModel", settings.llm_model),
    }


class ThreadPatch(BaseModel):
    name: str | None = None
    llmModel: str | None = None


@router.patch("/{thread_id}")
async def patch_thread(
    thread_id: str,
    body: ThreadPatch,
    pool: asyncpg.Pool = Depends(get_db_pool),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    await _get_owned_thread(pool, thread_id, user)
    metadata_updates = {"llmModel": body.llmModel} if body.llmModel is not None else None
    await threads_db.update_thread(pool, thread_id, name=body.name, metadata_updates=metadata_updates)
    return {"ok": True}


@router.delete("/{thread_id}")
async def delete_thread(
    thread_id: str,
    pool: asyncpg.Pool = Depends(get_db_pool),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    await _get_owned_thread(pool, thread_id, user)
    current = await registry.pop(thread_id)
    if current:
        await mcp_client.disconnect(current)
    await threads_db.soft_delete_thread(pool, thread_id)
    return {"ok": True}


class McpRequest(BaseModel):
    projectId: str | None = None


@router.post("/{thread_id}/mcp")
async def set_mcp(
    thread_id: str,
    body: McpRequest,
    pool: asyncpg.Pool = Depends(get_db_pool),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    await _get_owned_thread(pool, thread_id, user)

    current = await registry.get(thread_id)
    if current:
        await mcp_client.disconnect(current)
        await registry.set(thread_id, None)

    if not body.projectId:
        await threads_db.update_thread(
            pool, thread_id, metadata_updates={"mcp_project_id": None, "mcp_project_name": None}
        )
        return {"connected": False, "toolCount": 0, "projectName": None}

    projects = await langflow_client.list_projects()
    project = next((p for p in projects if p.id == body.projectId), None)
    if project is None:
        raise HTTPException(status_code=404, detail="Langflow project not found")

    try:
        composer = await langflow_client.get_composer_url(project.id)
        binding = await mcp_client.connect(
            project.id,
            project.name,
            composer.streamable_http_url,
            composer.legacy_sse_url,
            headers=langflow_client.auth_headers(),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"could not connect to {project.name}: {exc}") from exc

    await registry.set(thread_id, binding)
    await threads_db.update_thread(
        pool, thread_id, metadata_updates={"mcp_project_id": project.id, "mcp_project_name": project.name}
    )
    return {"connected": True, "toolCount": len(binding.tools_openai), "projectName": project.name}
