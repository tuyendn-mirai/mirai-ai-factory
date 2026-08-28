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
