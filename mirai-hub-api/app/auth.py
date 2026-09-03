"""JWT encode/decode (HS256) for the httpOnly session cookie.

Dev-only, single hardcoded user (see app/routers/auth.py) — replace with a
real identity provider before this app is anything but an internal POC, same
scope as the old mirai_hub/auth.py it replaces.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import jwt

from app.settings import settings

ALGORITHM = "HS256"
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days
COOKIE_NAME = "mirai_hub_session"


@dataclass(frozen=True)
class TokenPayload:
    username: str


def create_access_token(username: str) -> str:
    now = int(time.time())
    payload = {"sub": username, "iat": now, "exp": now + TOKEN_TTL_SECONDS}
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> TokenPayload | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    username = payload.get("sub")
    if not username:
        return None
    return TokenPayload(username=username)
