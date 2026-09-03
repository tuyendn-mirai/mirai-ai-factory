"""FastAPI app: lifespan (asyncpg pool, admin user upsert), routers, CORS.

Replaces the old Chainlit entrypoint (app.py at the repo root, now deleted)
— see the plan's Backend section for the full route-by-route mapping.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.pool import create_pool
from app.routers import auth, chat, files, mcp, models, threads
from app.settings import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ADMIN_USERNAME = "admin"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Pool creation (and the DB round-trip below) only happens once uvicorn
    # actually starts the app — not at import time — so `from app.main
    # import app` works without a live Postgres.
    pool = await create_pool()
    app.state.pool = pool
    try:
        row = await pool.fetchrow(
            """INSERT INTO "User" ("identifier", "metadata") VALUES ($1, $2)
               ON CONFLICT ("identifier") DO UPDATE SET "updatedAt" = CURRENT_TIMESTAMP
               RETURNING "id\"""",
            ADMIN_USERNAME,
            {},
        )
        assert row is not None
        app.state.admin_user_id = row["id"]
        logger.info("mirai-hub-api ready (admin user id=%s)", row["id"])
        yield
    finally:
        await pool.close()


app = FastAPI(title="mirai-hub-api", lifespan=lifespan)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api")
app.include_router(models.router, prefix="/api")
app.include_router(mcp.router, prefix="/api")
app.include_router(threads.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(files.router, prefix="/api")
