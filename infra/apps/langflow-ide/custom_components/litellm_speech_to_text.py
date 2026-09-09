import mimetypes
from pathlib import Path

import httpx

from langflow.custom import Component
from langflow.io import FileInput, MessageTextInput, Output, SecretStrInput
from langflow.schema.message import Message


class LiteLLMSpeechToText(Component):
    display_name = "LiteLLM Speech to Text"
    description = (
        "Transcribe audio via LiteLLM's OpenAI-compatible /v1/audio/transcriptions "
        "endpoint (Tang 3), proxied to whisperx-tiny on LocalAI (Tang 2)."
    )
    icon = "mic"
    name = "LiteLLMSpeechToText"

    inputs = [
        FileInput(
            name="audio_file",
            display_name="Audio File",
            file_types=["wav", "mp3", "m4a", "flac", "ogg"],
            required=True,
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

    def transcribe(self) -> Message:
        url = f"{self.base_url.rstrip('/')}/v1/audio/transcriptions"
        path = Path(self.audio_file)
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"

        with path.open("rb") as f:
            response = httpx.post(
                url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                data={"model": self.model},
                files={"file": (path.name, f, content_type)},
                timeout=120,
            )
        response.raise_for_status()
        text = response.json()["text"]

        message = Message(text=text)
        self.status = message
        return message
