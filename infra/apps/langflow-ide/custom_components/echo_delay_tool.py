import asyncio
from datetime import datetime, timezone

from langflow.custom import Component
from langflow.io import IntInput, MessageTextInput, Output
from langflow.schema.message import Message


class EchoDelayTool(Component):
    display_name = "Echo Delay Tool"
    description = (
        "Test-only tool: sleeps for delay_seconds, then echoes label back with "
        "start/end timestamps. Call it more than once in the same turn (same "
        "label or different) to check whether the caller actually runs "
        "multiple MCP tool calls concurrently or one at a time - if two calls "
        "both sleep 5s and the total wall-clock time is ~10s, they ran "
        "sequentially; if ~5s, they ran in parallel."
    )
    icon = "clock"
    name = "EchoDelayTool"

    inputs = [
        MessageTextInput(
            name="label",
            display_name="Label",
            required=True,
            info="Any string to tell this call's result apart from another parallel call.",
        ),
        IntInput(
            name="delay_seconds",
            display_name="Delay Seconds",
            value=5,
            info="How long to sleep before responding, in seconds.",
        ),
    ]

    outputs = [
        Output(display_name="Result", name="result", method="run"),
    ]

    async def run(self) -> Message:
        start = datetime.now(timezone.utc)
        await asyncio.sleep(self.delay_seconds)
        end = datetime.now(timezone.utc)

        text = (
            f"[{self.label}] started={start.strftime('%H:%M:%S.%f')[:-3]} "
            f"ended={end.strftime('%H:%M:%S.%f')[:-3]} delay={self.delay_seconds}s"
        )
        message = Message(text=text)
        self.status = message
        return message
