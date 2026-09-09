import uuid

import httpx

from langflow.custom import Component
from langflow.io import MessageTextInput, Output, SecretStrInput
from langflow.schema.message import Message
from langflow.services.deps import get_storage_service


class LiteLLMTextToSpeech(Component):
    display_name = "LiteLLM Text to Speech"
    description = (
        "Synthesize speech via LiteLLM's OpenAI-compatible /v1/audio/speech "
        "endpoint (Tang 3), proxied to vits-ljs-sherpa on LocalAI (Tang 2)."
    )
    icon = "speaker"
    name = "LiteLLMTextToSpeech"

    inputs = [
        MessageTextInput(
            name="input_text",
            display_name="Text",
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
            value="vits-ljs-sherpa",
        ),
        MessageTextInput(
            name="voice",
            display_name="Voice",
            value="default",
            info=(
                "Required field on LiteLLM's /v1/audio/speech even for "
                "single-voice models - vits-ljs-sherpa ignores the value."
            ),
        ),
    ]

    outputs = [
        Output(display_name="Audio Message", name="audio", method="synthesize"),
    ]

    async def synthesize(self) -> Message:
        url = f"{self.base_url.rstrip('/')}/v1/audio/speech"
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "input": self.input_text, "voice": self.voice},
            )
        response.raise_for_status()

        # Same convention Langflow itself uses for uploaded files
        # (flow_id/file_name), served back through the Files API.
        flow_id = str(getattr(getattr(self, "graph", None), "flow_id", None) or "misc")
        file_name = f"{uuid.uuid4().hex}.mp3"

        storage_service = get_storage_service()
        await storage_service.save_file(flow_id=flow_id, file_name=file_name, data=response.content)

        # NOT Message(files=[...]): Langflow 1.12.0's ChatOutputResponse file
        # validator (lfx/utils/schemas.py) only recognizes extensions in
        # TEXT_FILE_TYPES/IMG_FILE_TYPES - "mp3" matches neither, so it raises
        # "File type is required" and drops the whole chat event (Playground
        # shows text only, no crash visible to the user). A plain download
        # link sidesteps that validator entirely; the Files API endpoint also
        # always sends Content-Disposition: attachment, so this is a download
        # link, not an inline player, regardless of how it's delivered.
        download_path = f"/api/v1/files/download/{flow_id}/{file_name}"
        message = Message(text=f"{self.input_text}\n\n[Download audio]({download_path})")
        self.status = message
        return message
