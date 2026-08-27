"""Layer 5 Hub UI entrypoint.

No orchestration happens here (Cách 2 nghiêm ngặt): this process only reads
the agent catalog, filters it by the current user's role/tenant, forwards
the chosen flow's chat turns to langflow-runtime (Layer 4), and streams the
result back. All reasoning/tool-calling is already baked into the flow.
"""

from __future__ import annotations

import logging

import chainlit as cl
import httpx

from mirai_hub import auth  # noqa: F401 - registers auth callbacks
from mirai_hub import data_layer  # noqa: F401 - registers data layer if DATABASE_URL set
from mirai_hub import catalog, langflow_client

logger = logging.getLogger(__name__)


@cl.set_chat_profiles
async def chat_profiles(current_user: cl.User | None) -> list[cl.ChatProfile]:
    role = (current_user.metadata or {}).get("role") if current_user else None
    tenant = (current_user.metadata or {}).get("tenant") if current_user else None

    agents = catalog.list_agents_for_user(role, tenant)
    return [
        cl.ChatProfile(
            name=agent.name,
            markdown_description=(
                f"**{agent.domain}** · v{agent.version} · owner: {agent.owner}\n\n{agent.description}"
            ),
        )
        for agent in agents
    ]


@cl.on_chat_start
async def on_chat_start() -> None:
    profile_name = cl.user_session.get("chat_profile")
    if not profile_name:
        await cl.Message(content="Không có agent nào khả dụng cho tài khoản này.").send()
        return
    await cl.Message(content=f"Đã chọn **{profile_name}**. Nhập tin nhắn để bắt đầu.").send()


@cl.on_message
async def on_message(message: cl.Message) -> None:
    profile_name = cl.user_session.get("chat_profile")
    agent = next((a for a in catalog.list_agents() if a.name == profile_name), None)

    if agent is None:
        await cl.Message(content="Không tìm thấy agent tương ứng với profile đã chọn.").send()
        return

    if agent.flow_id.startswith("REPLACE_WITH_"):
        await cl.Message(
            content=(
                f"Agent **{agent.name}** chưa có `flow_id` thật (chưa export flow từ "
                "langflow-ide) — xem README checklist."
            )
        ).send()
        return

    reply = cl.Message(content="")
    await reply.send()

    try:
        async for chunk in langflow_client.stream_run(
            flow_id=agent.flow_id,
            message=message.content,
            session_id=cl.context.session.id,
        ):
            await reply.stream_token(chunk)
    except httpx.HTTPError:
        logger.exception("langflow-runtime call failed for flow_id=%s", agent.flow_id)
        await reply.stream_token("\n\n_(Lỗi khi gọi langflow-runtime — xem log server.)_")

    await reply.update()
