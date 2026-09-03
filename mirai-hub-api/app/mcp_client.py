"""Thin MCP client wrapper around the official `mcp` SDK.

Moved from mirai_hub/mcp_client.py verbatim (only the module docstring's
directory reference below has changed) — this app manages its own
`ClientSession` per thread, driven by `POST /api/threads/{id}/mcp`.

Concurrency note (load-bearing, verified against Chainlit's own source
hitting the identical problem): `streamable_http_client`/`sse_client` open an
anyio task group that must be entered AND exited from the same asyncio task.
A connection can't be opened in one request handler and closed from another
via a stack held on a per-connection session object — that corrupts anyio's
cancel scopes across tasks. Instead, a dedicated background task owns the
AsyncExitStack for the lifetime of the connection and closes it itself when
signaled (see `connect`/`disconnect` below), mirroring Chainlit's own `/mcp`
connect route (chainlit/server.py) and this app's `app/mcp_registry.py`.
"""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import AsyncExitStack
from dataclasses import dataclass, field
from typing import Any

import httpx
from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamable_http_client
from mcp.types import Tool

logger = logging.getLogger(__name__)

CONNECT_TIMEOUT = 30.0
DISCONNECT_TIMEOUT = 10.0
# httpx.AsyncClient defaults to a 5s read timeout, which the streamable-HTTP
# transport inherits for every call_tool request -- too short for a Langflow
# flow that runs an embedding + LLM call (RAG), so the connection was being
# torn down mid-run with no response ever reaching the caller.
TOOL_CALL_READ_TIMEOUT = 300.0


@dataclass
class McpBinding:
    project_id: str
    project_name: str
    session: ClientSession
    tools_openai: list[dict[str, Any]]
    _stop: asyncio.Event = field(repr=False)
    _task: asyncio.Task = field(repr=False)


def _to_openai_tool(tool: Tool) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description or "",
            "parameters": tool.inputSchema or {"type": "object", "properties": {}},
        },
    }


async def _open_streams(
    stack: AsyncExitStack,
    streamable_url: str | None,
    sse_url: str | None,
    headers: dict[str, str] | None,
):
    if streamable_url:
        timeout = httpx.Timeout(10.0, read=TOOL_CALL_READ_TIMEOUT)
        http_client = await stack.enter_async_context(httpx.AsyncClient(headers=headers, timeout=timeout))
        read, write, _ = await stack.enter_async_context(
            streamable_http_client(streamable_url, http_client=http_client)
        )
        return read, write
    if sse_url:
        read, write = await stack.enter_async_context(sse_client(sse_url, headers=headers))
        return read, write
    raise ValueError("Langflow returned no usable MCP connection URL for this project")


async def connect(
    project_id: str,
    project_name: str,
    streamable_url: str | None,
    sse_url: str | None,
    headers: dict[str, str] | None = None,
) -> McpBinding:
    ready: asyncio.Event = asyncio.Event()
    stop: asyncio.Event = asyncio.Event()
    holder: dict[str, Any] = {}

    async def _runner() -> None:
        stack = AsyncExitStack()
        try:
            try:
                read, write = await _open_streams(stack, streamable_url, sse_url, headers)
                session = await stack.enter_async_context(ClientSession(read, write))
                await session.initialize()
                holder["session"] = session
            except BaseException as exc:  # noqa: BLE001 - reported to the caller, not swallowed
                holder["error"] = exc
            finally:
                ready.set()
            if "error" not in holder:
                await stop.wait()
        finally:
            await stack.aclose()

    task = asyncio.create_task(_runner())
    await asyncio.wait_for(ready.wait(), timeout=CONNECT_TIMEOUT)

    if "error" in holder:
        stop.set()
        raise holder["error"]

    session: ClientSession = holder["session"]
    tools = (await session.list_tools()).tools
    return McpBinding(
        project_id=project_id,
        project_name=project_name,
        session=session,
        tools_openai=[_to_openai_tool(t) for t in tools],
        _stop=stop,
        _task=task,
    )


async def disconnect(binding: McpBinding | None) -> None:
    if binding is None:
        return
    binding._stop.set()
    try:
        await asyncio.wait_for(binding._task, timeout=DISCONNECT_TIMEOUT)
    except Exception:
        logger.exception("MCP disconnect for project %s did not clean up cleanly", binding.project_id)


async def call_tool(binding: McpBinding, name: str, arguments: dict[str, Any]) -> str:
    result = await binding.session.call_tool(name, arguments)
    text = "\n".join(block.text for block in result.content if getattr(block, "text", None))
    if result.isError:
        return f"Error: {text or 'tool call failed with no error detail'}"
    return text or json.dumps([block.model_dump() for block in result.content])
