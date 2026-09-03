"""Thin OpenAI-compatible client pointed at LiteLLM (Layer 3). Pure I/O —
moved from mirai_hub/llm_client.py verbatim, only the settings import path
changed.
"""

from __future__ import annotations

from functools import lru_cache

from openai import AsyncOpenAI

from app.settings import settings


@lru_cache(maxsize=1)
def get_client() -> AsyncOpenAI:
    return AsyncOpenAI(base_url=settings.litellm_base_url, api_key=settings.litellm_api_key)


async def list_models() -> list[str]:
    """Model choices for GET /api/models — live from LiteLLM's own
    /v1/models, not a hardcoded list, so adding a model in litellm's
    proxy_config shows up here without redeploying mirai-hub-api.
    """
    return sorted([model.id async for model in get_client().models.list()])
