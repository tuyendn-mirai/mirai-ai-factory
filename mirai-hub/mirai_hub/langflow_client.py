"""Thin client for the Langflow-runtime "run" endpoint (Layer 4).

Shape verified against public Langflow docs (docs.langflow.org/api-flows-run),
NOT against the real `langflow-runtime` deployment — it currently serves zero
flows (see infra/apps/langflow-runtime/README.md), so this has not been
exercised against a live flow yet. Verify event field names once a real flow
is exported there (see README checklist).
"""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator

import httpx

LANGFLOW_RUNTIME_BASE_URL = os.environ.get(
    "LANGFLOW_RUNTIME_BASE_URL", "http://langflow-runtime.mirai.local"
)
LANGFLOW_API_KEY = os.environ.get("LANGFLOW_API_KEY")


async def stream_run(flow_id: str, message: str, session_id: str) -> AsyncIterator[str]:
    """Yield text chunks streamed from a Langflow flow run.

    Raises httpx.HTTPStatusError on a non-2xx response so callers can surface
    a clear error instead of silently yielding nothing.
    """
    url = f"{LANGFLOW_RUNTIME_BASE_URL}/api/v1/run/{flow_id}"
    headers = {"Content-Type": "application/json"}
    if LANGFLOW_API_KEY:
        headers["x-api-key"] = LANGFLOW_API_KEY

    payload = {
        "input_value": message,
        "output_type": "chat",
        "input_type": "chat",
        "session_id": session_id,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST", url, params={"stream": "true"}, headers=headers, json=payload
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                raw = line.removeprefix("data:").strip()
                if not raw:
                    continue
                event = json.loads(raw)
                if event.get("event") == "token":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk:
                        yield chunk
                elif event.get("event") == "end":
                    return
