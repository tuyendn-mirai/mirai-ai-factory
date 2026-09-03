"""GET /api/mcp/projects — live from Langflow's project list."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends

from app import langflow_client
from app.deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mcp", tags=["mcp"])


@router.get("/projects")
async def get_projects(user=Depends(get_current_user)) -> list[dict]:
    try:
        projects = await langflow_client.list_projects()
    except Exception:
        logger.exception("Failed to list Langflow projects")
        return []
    return [{"id": p.id, "name": p.name} for p in projects]
