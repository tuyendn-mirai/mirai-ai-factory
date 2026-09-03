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


def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.dev_aws_endpoint,
        aws_access_key_id=settings.app_aws_access_key,
        aws_secret_access_key=settings.app_aws_secret_key,
        region_name=settings.app_aws_region,
        config=Config(signature_version="s3v4"),
    )


def presign_put(object_key: str, mime: str | None) -> str:
    params: dict[str, str] = {"Bucket": settings.bucket_name, "Key": object_key}
    if mime:
        params["ContentType"] = mime
    client = _client()
    try:
        return client.generate_presigned_url(
            "put_object", Params=params, ExpiresIn=PRESIGN_EXPIRES_SECONDS
        )
    finally:
        client.close()
