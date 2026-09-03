"""Raw asyncpg queries against `"Thread"` — see scripts/init_schema.py for
the exact (PascalCase, quoted) column names, which are the ground truth this
module is written against.
"""

from __future__ import annotations

from typing import Any

import asyncpg


async def list_threads(pool: asyncpg.Pool, user_id: str) -> list[dict[str, Any]]:
    rows = await pool.fetch(
        """SELECT "id", "name", "updatedAt" FROM "Thread"
           WHERE "userId" = $1 AND "deletedAt" IS NULL
           ORDER BY "updatedAt" DESC""",
        user_id,
    )
    return [
        {"id": r["id"], "name": r["name"], "updatedAt": r["updatedAt"].isoformat()} for r in rows
    ]


async def create_thread(pool: asyncpg.Pool, user_id: str, name: str = "New chat") -> str:
    row = await pool.fetchrow(
        """INSERT INTO "Thread" ("name", "metadata", "userId")
           VALUES ($1, $2, $3) RETURNING "id\"""",
        name,
        {},
        user_id,
    )
    assert row is not None
    return row["id"]


async def get_thread_row(pool: asyncpg.Pool, thread_id: str) -> asyncpg.Record | None:
    return await pool.fetchrow(
        'SELECT * FROM "Thread" WHERE "id" = $1 AND "deletedAt" IS NULL', thread_id
    )


async def update_thread(
    pool: asyncpg.Pool,
    thread_id: str,
    *,
    name: str | None = None,
    metadata_updates: dict[str, Any] | None = None,
) -> None:
    row = await pool.fetchrow('SELECT "metadata" FROM "Thread" WHERE "id" = $1', thread_id)
    if row is None:
        raise LookupError(thread_id)

    metadata = dict(row["metadata"] or {})
    if metadata_updates:
        for key, value in metadata_updates.items():
            if value is None:
                metadata.pop(key, None)
            else:
                metadata[key] = value

    fields = ['"metadata" = $2', '"updatedAt" = CURRENT_TIMESTAMP']
    params: list[Any] = [thread_id, metadata]
    if name is not None:
        params.append(name)
        fields.append(f'"name" = ${len(params)}')

    await pool.execute(f'UPDATE "Thread" SET {", ".join(fields)} WHERE "id" = $1', *params)


async def touch_thread(pool: asyncpg.Pool, thread_id: str) -> None:
    await pool.execute(
        'UPDATE "Thread" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1', thread_id
    )


async def soft_delete_thread(pool: asyncpg.Pool, thread_id: str) -> None:
    await pool.execute(
        'UPDATE "Thread" SET "deletedAt" = CURRENT_TIMESTAMP WHERE "id" = $1', thread_id
    )
