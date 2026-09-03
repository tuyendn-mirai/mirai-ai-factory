"""asyncpg pool, schema-pinned via a search_path DSN option.

DSN-building logic ported from mirai_hub/data_layer.py's `_asyncpg_dsn` —
strips SQLAlchemy's `+asyncpg` driver suffix (asyncpg doesn't understand it)
and pins search_path via the `options` DSN param, since this app shares the
`ai_factory` Postgres database with litellm/langfuse, isolated by schema
instead of a dedicated database.

Also registers a jsonb codec so `"metadata"`/`"props"` columns round-trip as
plain Python dicts instead of raw JSON text — asyncpg has no built-in
dict<->jsonb conversion.
"""

from __future__ import annotations

import json
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

import asyncpg

from app.settings import settings


def _asyncpg_dsn(database_url: str, schema: str) -> str:
    parts = urlsplit(database_url)
    scheme = parts.scheme.split("+")[0]
    query = dict(parse_qsl(parts.query))
    query["options"] = f"-c search_path={schema}"
    return urlunsplit(
        (scheme, parts.netloc, parts.path, urlencode(query, quote_via=quote), parts.fragment)
    )


async def _init_connection(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
        format="text",
    )


async def create_pool() -> asyncpg.Pool:
    dsn = _asyncpg_dsn(settings.database_url, settings.database_schema)
    return await asyncpg.create_pool(dsn, init=_init_connection, min_size=1, max_size=10)
