"""Thin OpenAI-compatible client pointed at LiteLLM (Layer 3). Pure I/O — no
chainlit import, so this can be exercised/tested without a running chat
session.
"""

from __future__ import annotations

from functools import lru_cache

from openai import AsyncOpenAI

from mirai_hub.settings import settings


@lru_cache(maxsize=1)
def get_client() -> AsyncOpenAI:
    return AsyncOpenAI(base_url=settings.litellm_base_url, api_key=settings.litellm_api_key)


async def list_models() -> list[str]:
    """Model choices for the chat-settings picker (mirai_hub/app.py) — live
    from LiteLLM's own /v1/models, not a hardcoded list, so adding a model
    in litellm's proxy_config shows up here without redeploying mirai-hub.
    """
    return sorted([model.id async for model in get_client().models.list()])
