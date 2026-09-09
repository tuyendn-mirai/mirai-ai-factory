import mimetypes

import httpx

from langflow.custom import Component
from langflow.io import MessageTextInput, Output, SecretStrInput
from langflow.schema.message import Message


class LiteLLMSpeechToTextFromURL(Component):
    display_name = "LiteLLM Speech to Text (from URL)"
    description = (
        "Fetch audio from a URL (e.g. a presigned S3/MinIO GET URL) and "
        "transcribe it via LiteLLM's OpenAI-compatible /v1/audio/transcriptions "
        "endpoint (Tang 3), proxied to whisperx-tiny on LocalAI (Tang 2). "
        "MCP tool callers can only pass plain strings, not upload a file - "
        "this is the URL-based sibling of LiteLLMSpeechToText's FileInput, "
        "meant for flows exposed as MCP tools rather than used in Playground."
    )
    icon = "mic"
    name = "LiteLLMSpeechToTextFromURL"

    inputs = [
        MessageTextInput(
            name="audio_url",
            display_name="Audio URL",
            required=True,
            info="Any URL Langflow's backend pod can reach with a plain GET (presigned S3/MinIO URLs work).",
        ),
        MessageTextInput(
            name="base_url",
            display_name="LiteLLM Base URL",
            value="http://litellm.litellm.svc.cluster.local:4000",
            info="No trailing slash, no /v1 suffix - it is appended below.",
        ),
        SecretStrInput(
            name="api_key",
            display_name="LiteLLM Master Key",
            required=True,
            info="Same value as LITELLM_MASTER_KEY / PROXY_MASTER_KEY.",
        ),
        MessageTextInput(
            name="model",
            display_name="Model",
            value="whisperx-tiny",
        ),
    ]

    outputs = [
        Output(display_name="Transcript", name="transcript", method="transcribe"),
    ]

    async def transcribe(self) -> Message:
        async with httpx.AsyncClient(timeout=120) as client:
            audio_resp = await client.get(self.audio_url)
            audio_resp.raise_for_status()

            file_name = self.audio_url.split("?")[0].rsplit("/", 1)[-1] or "audio"
            content_type = (
                audio_resp.headers.get("content-type")
                or mimetypes.guess_type(file_name)[0]
                or "application/octet-stream"
            )

            response = await client.post(
                f"{self.base_url.rstrip('/')}/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                data={"model": self.model},
                files={"file": (file_name, audio_resp.content, content_type)},
            )
        response.raise_for_status()
        text = response.json()["text"]

        message = Message(text=text)
        self.status = message
        return message
