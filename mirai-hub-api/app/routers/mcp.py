"""GET /api/mcp/projects — live from Langflow's project list.
GET /api/mcp/projects/{id}/tools — that project's tool list: names,
descriptions and enabled flags come from Langflow's lightweight REST
listing (app/langflow_client.get_project_tools), enriched with each
enabled tool's input schema from a throwaway MCP session
(app/mcp_client.list_tools_ephemeral) — the REST listing alone doesn't
carry a tool's parameters."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from app import langflow_client, mcp_client
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


@router.get("/projects/{project_id}/tools")
async def get_project_tools(project_id: str, user=Depends(get_current_user)) -> list[dict]:
    try:
        tools = await langflow_client.get_project_tools(project_id)
    except Exception as exc:
        logger.exception("Failed to list tools for Langflow project %s", project_id)
        raise HTTPException(status_code=502, detail=f"could not list tools: {exc}") from exc

    # Input schemas only exist on the MCP protocol's own tools/list, not the
    # REST listing above — skip opening a session when nothing is enabled
    # (a disabled-only project can't be connected to at all).
    schema_by_action_name: dict[str, dict] = {}
    if any(t.mcp_enabled for t in tools):
        try:
            projects = await langflow_client.list_projects()
            project = next((p for p in projects if p.id == project_id), None)
            if project is not None:
                composer = await langflow_client.get_composer_url(project_id)
                live_tools = await mcp_client.list_tools_ephemeral(
                    project.id,
                    project.name,
                    composer.streamable_http_url,
                    composer.legacy_sse_url,
                    headers=langflow_client.auth_headers(),
                )
                schema_by_action_name = {t["function"]["name"]: t["function"]["parameters"] for t in live_tools}
        except Exception:
            # Degrade to REST-only info (no schemas) rather than failing the
            # whole request — the picker is still useful without them.
            logger.exception("Failed to fetch live tool schemas for project %s", project_id)

    return [
        {
            "id": t.id,
            "name": t.name,
            "actionName": t.action_name,
            "description": t.description,
            "mcpEnabled": t.mcp_enabled,
            "parameters": schema_by_action_name.get(t.action_name),
        }
        for t in tools
    ]
