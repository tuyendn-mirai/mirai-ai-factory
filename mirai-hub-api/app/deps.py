"""FastAPI dependencies: DB pool access and cookie-based auth."""

from __future__ import annotations

from dataclasses import dataclass

import asyncpg
from fastapi import HTTPException, Request

from app.auth import COOKIE_NAME, decode_access_token


@dataclass(frozen=True)
class CurrentUser:
    id: str
    username: str


def get_db_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.pool


def get_current_user(request: Request) -> CurrentUser:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="not authenticated")
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    admin_user_id: str = request.app.state.admin_user_id
    return CurrentUser(id=admin_user_id, username=payload.username)
