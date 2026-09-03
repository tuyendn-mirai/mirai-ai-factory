"""POST /api/auth/login, /api/auth/logout, GET /api/auth/me.

Dev-only, single hardcoded `admin`/`DEV_ADMIN_PASSWORD` identity — matches
the scope of the old mirai_hub/auth.py it replaces (don't build multi-user).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from app.auth import COOKIE_NAME, TOKEN_TTL_SECONDS, create_access_token
from app.deps import CurrentUser, get_current_user
from app.settings import settings

router = APIRouter(prefix="/auth", tags=["auth"])

ADMIN_USERNAME = "admin"


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(body: LoginRequest, response: Response) -> dict:
    if body.username != ADMIN_USERNAME or body.password != settings.dev_admin_password:
        raise HTTPException(status_code=401, detail="invalid credentials")

    token = create_access_token(body.username)
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=False,  # plain HTTP locally, matches the existing no-TLS k3d setup
        path="/",
        max_age=TOKEN_TTL_SECONDS,
    )
    return {"ok": True, "user": {"username": body.username}}


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
async def me(user: CurrentUser = Depends(get_current_user)) -> dict:
    return {"username": user.username}
