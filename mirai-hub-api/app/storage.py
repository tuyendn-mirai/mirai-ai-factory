"""boto3 S3 client + presign helpers for direct-to-MinIO browser uploads.

The old Chainlit build used Chainlit's own `S3StorageClient` (subclassed in
mirai_hub/data_layer.py as `_S3StorageClient` to work around a
`TypeError` in its `.close()`), which proxied uploads/downloads through the
app process. This app instead hands the browser a presigned PUT URL so the
file bytes go straight to MinIO (see `POST /api/uploads/presign` in
app/routers/files.py) — no equivalent workaround is needed here since we
talk to boto3 directly and never call `.close()` on a long-lived client.
"""

from __future__ import annotations

import boto3
from botocore.client import Config

from app.settings import settings

PRESIGN_EXPIRES_SECONDS = 900


def _client(endpoint: str | None):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.app_aws_access_key,
        aws_secret_access_key=settings.app_aws_secret_key,
        region_name=settings.app_aws_region,
        config=Config(signature_version="s3v4"),
    )


def presign_put(object_key: str, mime: str | None) -> str:
    """Presigned PUT handed straight to the browser (see
    POST /api/uploads/presign) — MUST use settings.dev_aws_endpoint (a
    browser-reachable host), never dev_aws_endpoint_internal. A pod-only
    hostname here breaks every upload with a DNS failure the browser's
    fetch() swallows silently (no visible error, upload just never happens).
    """
    params: dict[str, str] = {"Bucket": settings.bucket_name, "Key": object_key}
    if mime:
        params["ContentType"] = mime
    client = _client(settings.dev_aws_endpoint)
    try:
        return client.generate_presigned_url(
            "put_object", Params=params, ExpiresIn=PRESIGN_EXPIRES_SECONDS
        )
    finally:
        client.close()


def presign_get(object_key: str) -> str:
    """Presigned GET for a caller INSIDE the cluster (a Langflow flow's own
    pod, invoked as an MCP tool - see app/chat_loop.py) to fetch an
    already-uploaded attachment by URL. Deliberately uses
    dev_aws_endpoint_internal (falling back to dev_aws_endpoint if unset),
    NOT the browser-facing host presign_put uses - this URL is never sent to
    a browser. Mirrors presign_put's expiry (900s): long enough for the LLM
    to decide to call a tool and for that tool's flow to run, but the URL is
    meant to be used once per turn, not persisted.
    """
    client = _client(settings.dev_aws_endpoint_internal or settings.dev_aws_endpoint)
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.bucket_name, "Key": object_key},
            ExpiresIn=PRESIGN_EXPIRES_SECONDS,
        )
    finally:
        client.close()
