"""GET /api/models — live from LiteLLM's /v1/models."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends

from app import llm_client
from app.deps import get_current_user
from app.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["models"])


@router.get("/models")
async def get_models(user=Depends(get_current_user)) -> list[str]:
    try:
        return await llm_client.list_models()
    except Exception:
        logger.exception("Failed to list LiteLLM models")
        return [settings.llm_model]
