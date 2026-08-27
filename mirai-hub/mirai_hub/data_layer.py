"""Chat/session persistence (Layer 5 responsibility #3).

Only registers a data layer when DATABASE_URL is set — without it Chainlit
falls back to in-memory sessions (fine for local dev, loses history on
restart). Shares the same Postgres/DB as Langfuse (`ai_factory`, see
infra/apps/langfuse/values.yaml), separated by schema via `search_path`
instead of a dedicated database — same pattern litellm/langfuse already use
(langfuse uses Prisma's `?schema=` URL trick; asyncpg doesn't understand
that param, so this uses `server_settings.search_path` via connect_args
instead — verified against the real `mirai-dev-postgres` container: a table
created with this search_path lands in the `miraihub` schema, not `public`).
"""

from __future__ import annotations

import os

import chainlit as cl
from chainlit.data.sql_alchemy import SQLAlchemyDataLayer

DATABASE_URL = os.environ.get("DATABASE_URL")
DATABASE_SCHEMA = os.environ.get("DATABASE_SCHEMA", "miraihub")

if DATABASE_URL:

    @cl.data_layer
    def get_data_layer() -> SQLAlchemyDataLayer:
        return SQLAlchemyDataLayer(
            conninfo=DATABASE_URL,
            connect_args={"server_settings": {"search_path": DATABASE_SCHEMA}},
        )
