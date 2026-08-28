"""Client for Langflow's project/MCP REST API (Layer 4) — source of the
requirement-7 MCP server picker. Pure I/O — no chainlit import.

Endpoint shapes verified directly against langflow-ai/langflow source
(current stable 1.11.5), not just docs:
- GET /api/v1/projects/ -> list of projects (a project == a Langflow
  "folder"; each can expose its flows as an MCP server).
- GET /api/v1/mcp/project/{id}/composer-url -> the actual URL to connect an
  MCP client to for that project (handles Langflow's own OAuth/Composer
  transparently); prefer streamable_http_url over the legacy SSE fallback.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import httpx

from mirai_hub.settings import settings


@dataclass(frozen=True)
class LangflowProject:
    id: str
    name: str


@dataclass(frozen=True)
class ComposerUrl:
    streamable_http_url: str | None
    legacy_sse_url: str | None


def auth_headers() -> dict[str, str]:
    """Also used to authenticate the MCP transport connection itself
    (mirai_hub/mcp_client.py) — a Langflow project's MCP endpoint requires
    the same x-api-key when its auth_settings.auth_type is "apikey" (verified
    live: the default "Starter Project" on this platform's langflow-runtime
    is apikey-protected).
    """
    return {"x-api-key": settings.langflow_api_key} if settings.langflow_api_key else {}


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.langflow_runtime_base_url, headers=auth_headers(), timeout=10.0
    )


async def list_projects() -> list[LangflowProject]:
    async with _client() as client:
        response = await client.get("/api/v1/projects/")
        response.raise_for_status()
        return [LangflowProject(id=p["id"], name=p["name"]) for p in response.json()]


def _rebase(url: str | None) -> str | None:
    """Langflow's composer-url response embeds its own idea of its host
    (confirmed live: this deployment returns "http://localhost:7860/..."
    regardless of how it was actually reached), which is unreachable from
    another pod. Keep only the path — it correctly encodes the project id
    and transport — and re-resolve it against the base_url we already know
    is reachable (LANGFLOW_RUNTIME_BASE_URL).
    """
    if not url:
        return None
    return urljoin(settings.langflow_runtime_base_url + "/", urlsplit(url).path.lstrip("/"))


async def get_composer_url(project_id: str) -> ComposerUrl:
    async with _client() as client:
        response = await client.get(f"/api/v1/mcp/project/{project_id}/composer-url")
        response.raise_for_status()
        data = response.json()
        return ComposerUrl(
            streamable_http_url=_rebase(data.get("streamable_http_url")),
            legacy_sse_url=_rebase(data.get("legacy_sse_url")),
        )
