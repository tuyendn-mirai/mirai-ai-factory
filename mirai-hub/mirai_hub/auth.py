"""Password auth (requirement 2). Dev-only, single hardcoded user — replace
with a real identity provider before this app is anything but an internal POC.
"""

from __future__ import annotations

import chainlit as cl

from mirai_hub.settings import settings


@cl.password_auth_callback
def password_auth_callback(username: str, password: str) -> cl.User | None:
    if username == "admin" and password == settings.dev_admin_password:
        return cl.User(identifier="admin")
    return None
