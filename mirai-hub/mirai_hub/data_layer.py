"""Official Chainlit data layer (requirement 1): Postgres + S3-compatible
storage (MinIO).

Uses `ChainlitDataLayer` (asyncpg-based), matching the exact schema shipped
by github.com/Chainlit/chainlit-datalayer (PascalCase quoted tables —
"User"/"Thread"/"Step"/"Element"/"Feedback", see scripts/init_schema.py).

`SQLAlchemyDataLayer` is NOT an equivalent alternative here — confirmed by
actually running it against this schema: it queries a different, lowercase
table-name schema ("users"/"threads"/...) left over from an older Chainlit
convention, which doesn't exist once the DB is initialized with the official
chainlit-datalayer DDL.

`ChainlitDataLayer.__init__` takes a plain `database_url` with no
`connect_args`, so schema isolation (this app shares the `ai_factory`
Postgres DB with litellm/langfuse, isolated by schema instead of a dedicated
database) is done via asyncpg's own `options=-c search_path=...` DSN
parameter — verified directly against asyncpg (`.connect()` and
`.create_pool()`, the latter being what `ChainlitDataLayer` actually uses)
against this app's real database.
"""

from __future__ import annotations

from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

import chainlit as cl
from chainlit.data.chainlit_data_layer import ChainlitDataLayer
from chainlit.data.storage_clients.s3 import S3StorageClient

from mirai_hub.settings import settings


class _S3StorageClient(S3StorageClient):
    """Chainlit 2.12.0's own `S3StorageClient.close()` does
    `await self.client.close()`, but `self.client` is a plain synchronous
    boto3 client whose `.close()` returns `None` — every graceful shutdown
    hits `TypeError: object NoneType can't be used in 'await' expression`
    (confirmed by actually running it). Override with the non-awaited call.
    """

    async def close(self) -> None:
        self.client.close()


def _asyncpg_dsn(database_url: str, schema: str) -> str:
    """Strip SQLAlchemy's `+asyncpg` driver suffix (asyncpg doesn't
    understand it) and pin search_path via the `options` DSN param.
    """
    parts = urlsplit(database_url)
    scheme = parts.scheme.split("+")[0]
    query = dict(parse_qsl(parts.query))
    query["options"] = f"-c search_path={schema}"
    return urlunsplit(
        (scheme, parts.netloc, parts.path, urlencode(query, quote_via=quote), parts.fragment)
    )


@cl.data_layer
def get_data_layer() -> ChainlitDataLayer:
    storage = _S3StorageClient(
        bucket=settings.bucket_name,
        endpoint_url=settings.dev_aws_endpoint,
        aws_access_key_id=settings.app_aws_access_key,
        aws_secret_access_key=settings.app_aws_secret_key,
        region_name=settings.app_aws_region,
    )
    return ChainlitDataLayer(
        database_url=_asyncpg_dsn(settings.database_url, settings.database_schema),
        storage_client=storage,
    )
