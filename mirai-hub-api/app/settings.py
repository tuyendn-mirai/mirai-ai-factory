"""Single source of environment configuration for mirai-hub-api.

Instantiated eagerly at import time (see `settings` below) so the process
fails fast at startup with a clear "field required" error on a missing
variable, instead of e.g. silently running with no DB configured.

`env_file=".env"` lets local dev (`uv run uvicorn app.main:app --reload`)
pick up the same `.env` the old Chainlit app used via its own dotenv
loading — in-cluster, real env vars from the Deployment/ExternalSecret take
precedence and no `.env` file is present at all.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        case_sensitive=False, extra="ignore", env_file=".env", env_file_encoding="utf-8"
    )

    # Auth (see app/auth.py) — HS256 JWT in an httpOnly cookie. Same secret
    # value as the old Chainlit build's CHAINLIT_AUTH_SECRET, renamed since
    # Chainlit itself no longer reads this env var.
    jwt_secret: str
    dev_admin_password: str

    # Postgres (see app/db/pool.py) — asyncpg, schema-qualified via
    # search_path (shared "ai_factory" DB with litellm/langfuse).
    database_url: str
    database_schema: str = "miraihub"

    # S3-compatible storage (MinIO) — presigned uploads (see app/storage.py).
    bucket_name: str
    app_aws_access_key: str
    app_aws_secret_key: str
    app_aws_region: str = "ap-northeast-1"
    dev_aws_endpoint: str | None = None  # unset against real AWS

    # Layer 3 — LiteLLM (OpenAI-compatible), the chat model backend.
    litellm_base_url: str = "http://litellm.litellm.svc.cluster.local:4000"
    litellm_api_key: str
    llm_model: str = "gemma4:e4b"  # default selection + fallback if /v1/models can't be reached
    max_tool_roundtrips: int = 4

    # Layer 4 — langflow-runtime, source of the MCP server picker.
    langflow_runtime_base_url: str = "http://langflow-runtime.langflow.svc.cluster.local:7860"
    langflow_api_key: str | None = None

    # CORS — only needed if a browser ever calls this API directly instead
    # of through mirai-hub-web's same-origin BFF proxy. Empty by default.
    cors_origins: list[str] = []


settings = Settings()
