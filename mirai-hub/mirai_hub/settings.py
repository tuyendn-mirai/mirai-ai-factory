"""Single source of environment configuration for mirai-hub.

Instantiated eagerly at import time (see `settings` below) so the process
fails fast at startup with a clear "field required" error on a missing
variable, instead of e.g. silently running with an in-memory data layer.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    # Auth (see mirai_hub/auth.py)
    dev_admin_password: str

    # Official Chainlit data layer — Postgres (see mirai_hub/data_layer.py)
    database_url: str
    database_schema: str = "miraihub"

    # Official Chainlit data layer — S3-compatible storage (MinIO)
    bucket_name: str
    app_aws_access_key: str
    app_aws_secret_key: str
    app_aws_region: str = "ap-northeast-1"
    dev_aws_endpoint: str | None = None  # unset against real AWS

    # Layer 3 — LiteLLM (OpenAI-compatible), the chat model backend
    litellm_base_url: str = "http://litellm.litellm.svc.cluster.local:4000"
    litellm_api_key: str
    llm_model: str = "gemma4:e4b"  # default selection + fallback if /v1/models can't be reached
    max_tool_roundtrips: int = 4

    # Layer 4 — langflow-runtime, source of the MCP server picker
    langflow_runtime_base_url: str = "http://langflow-runtime.langflow.svc.cluster.local:7860"
    langflow_api_key: str | None = None


settings = Settings()
