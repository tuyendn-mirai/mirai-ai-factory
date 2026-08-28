"""Mirai Hub — Layer 5 chat UI entrypoint. See mirai_hub/chat.py for the
tool-calling loop and mirai_hub/mcp_client.py for the requirement-7 MCP
server picker design (see also .chainlit/config.toml's [features.mcp]
comment for why Chainlit's own MCP feature is bypassed).
"""

from __future__ import annotations

import logging

import chainlit as cl
from chainlit.data import get_data_layer
from chainlit.input_widget import Select
from chainlit.types import ThreadDict

from mirai_hub import auth, data_layer  # noqa: F401 - registers auth/data-layer callbacks
from mirai_hub import chat, langflow_client, mcp_client
from mirai_hub.mcp_client import McpBinding

logger = logging.getLogger(__name__)

NO_SERVER = "__none__"


async def _build_mcp_settings(selected_project_id: str | None) -> None:
    try:
        projects = await langflow_client.list_projects()
        cl.user_session.set("mcp_projects_by_id", {p.id: p for p in projects})
        items = {"— no MCP server —": NO_SERVER, **{p.name: p.id for p in projects}}
    except Exception:
        logger.exception("Failed to list Langflow projects")
        items = {"— Langflow unavailable —": NO_SERVER}

    await cl.ChatSettings(
        [
            Select(
                id="mcp_project",
                label="MCP server (Langflow project)",
                items=items,
                initial_value=selected_project_id or NO_SERVER,
            )
        ]
    ).send()


async def _thread_metadata() -> dict:
    thread_id = cl.context.session.thread_id
    if not thread_id:
        return {}
    thread = await get_data_layer().get_thread(thread_id)
    return dict((thread or {}).get("metadata") or {})


async def _save_mcp_binding(project_id: str | None, project_name: str | None) -> None:
    thread_id = cl.context.session.thread_id
    if not thread_id:
        return
    metadata = await _thread_metadata()
    if project_id:
        metadata["mcp_project_id"] = project_id
        metadata["mcp_project_name"] = project_name
    else:
        metadata.pop("mcp_project_id", None)
        metadata.pop("mcp_project_name", None)
    await get_data_layer().update_thread(thread_id, metadata=metadata)


async def _connect_mcp(project_id: str) -> None:
    project = cl.user_session.get("mcp_projects_by_id", {}).get(project_id)
    if project is None:
        projects = await langflow_client.list_projects()
        cl.user_session.set("mcp_projects_by_id", {p.id: p for p in projects})
        project = next((p for p in projects if p.id == project_id), None)
    if project is None:
        await cl.Message(
            content="That Langflow project no longer exists — reopen Settings to refresh."
        ).send()
        return

    try:
        composer = await langflow_client.get_composer_url(project_id)
        binding = await mcp_client.connect(
            project_id,
            project.name,
            composer.streamable_http_url,
            composer.legacy_sse_url,
            headers=langflow_client.auth_headers(),
        )
    except Exception as exc:  # noqa: BLE001 - surfaced to the user, not a crash
        logger.exception("MCP connect failed for project %s", project_id)
        await cl.Message(content=f"Could not connect to **{project.name}**: {exc}").send()
        return

    cl.user_session.set("mcp_binding", binding)
    await _save_mcp_binding(project_id, project.name)

    tool_count = len(binding.tools_openai)
    if tool_count:
        await cl.Message(
            content=f"Connected to **{project.name}** — {tool_count} tool(s) available."
        ).send()
    else:
        await cl.Message(
            content=f"Connected to **{project.name}** — it currently exposes 0 MCP-enabled tools in Langflow."
        ).send()


@cl.on_chat_start
async def on_chat_start() -> None:
    cl.user_session.set("mcp_binding", None)
    await _build_mcp_settings(None)
    await cl.Message(
        content="Xin chào! Hỏi tôi bất cứ điều gì. Mở **Settings** ở sidebar để kết nối "
        "một MCP server (từ Langflow) nếu cần thêm công cụ cho cuộc trò chuyện này."
    ).send()


@cl.on_settings_update
async def on_settings_update(values: dict) -> None:
    new_id = values.get("mcp_project")
    current: McpBinding | None = cl.user_session.get("mcp_binding")

    if current and current.project_id == new_id:
        return

    if current:
        await mcp_client.disconnect(current)
        cl.user_session.set("mcp_binding", None)

    if new_id in (None, NO_SERVER):
        await _save_mcp_binding(None, None)
        await cl.Message(content="MCP server disconnected.").send()
        return

    await _connect_mcp(new_id)


@cl.on_message
async def on_message(message: cl.Message) -> None:
    await chat.handle_user_message(message)


@cl.on_chat_resume
async def on_chat_resume(thread: ThreadDict) -> None:
    cl.user_session.set("mcp_binding", None)
    metadata = thread.get("metadata") or {}
    project_id = metadata.get("mcp_project_id")

    if project_id:
        try:
            composer = await langflow_client.get_composer_url(project_id)
            binding = await mcp_client.connect(
                project_id,
                metadata.get("mcp_project_name", "?"),
                composer.streamable_http_url,
                composer.legacy_sse_url,
                headers=langflow_client.auth_headers(),
            )
            cl.user_session.set("mcp_binding", binding)
        except Exception:  # noqa: BLE001 - degrade to plain chat, don't block resume
            logger.exception("Resume: MCP reconnect failed for %s", project_id)
            await cl.Message(
                content="Previously connected MCP server is unavailable right now — continuing without tools."
            ).send()

    await _build_mcp_settings(project_id)


@cl.on_chat_end
async def on_chat_end() -> None:
    binding: McpBinding | None = cl.user_session.get("mcp_binding")
    await mcp_client.disconnect(binding)


@cl.on_stop
async def on_stop() -> None:
    logger.info("Generation stopped for session=%s", cl.context.session.id)
