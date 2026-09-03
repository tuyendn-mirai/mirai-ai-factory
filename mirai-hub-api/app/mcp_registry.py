"""In-process `dict[thread_id, McpBinding]` behind an `asyncio.Lock`.

Mirrors the old Chainlit build's `cl.user_session` storage of the live MCP
binding, just promoted to a module-level registry since there's no
per-connection session object anymore now that a chat turn is just a request
handled by a stateless FastAPI process.

Bindings are lost on process restart by design — this is *live* connection
state, not durable intent. The durable intent (which Langflow project a
thread *should* be connected to) lives in `Thread.metadata` instead (see
`app/db/threads.py` / `app/routers/threads.py`), and the API contract's
`GET /api/threads/{id}` exposes both (`mcpConnected` from here,
`mcpProjectId`/`mcpProjectName` from Postgres) so the frontend can offer a
"reconnect?" affordance after a backend restart instead of silently looking
connected.
"""

from __future__ import annotations

import asyncio

from app.mcp_client import McpBinding


class McpRegistry:
    def __init__(self) -> None:
        self._bindings: dict[str, McpBinding] = {}
        self._lock = asyncio.Lock()

    async def get(self, thread_id: str) -> McpBinding | None:
        async with self._lock:
            return self._bindings.get(thread_id)

    async def set(self, thread_id: str, binding: McpBinding | None) -> McpBinding | None:
        """Replace (or clear, if `binding` is None) the binding for a
        thread, returning whatever was previously registered so the caller
        can disconnect it.
        """
        async with self._lock:
            previous = self._bindings.pop(thread_id, None)
            if binding is not None:
                self._bindings[thread_id] = binding
            return previous

    async def pop(self, thread_id: str) -> McpBinding | None:
        async with self._lock:
            return self._bindings.pop(thread_id, None)


registry = McpRegistry()
