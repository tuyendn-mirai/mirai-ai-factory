"""Raw asyncpg queries against `"Element"` — see scripts/init_schema.py.

Judgment call: `"Element"."stepId"` is `NOT NULL`, but a file is uploaded
(`POST /api/uploads/presign` + `POST /api/threads/{id}/files/confirm`)
*before* the user's message — and therefore the `Step` it logically belongs
to — exists. `app/routers/files.py` satisfies the FK with a throwaway
placeholder `Step` (`"StepType" = 'undefined'`), and `reassign_step` below
re-points the `Element` at the real `user_message` Step once the message is
actually sent (see `app/chat_loop.py`). The old placeholder Step is left
behind, orphaned but harmless — `Element_stepId_fkey` is `ON DELETE CASCADE`,
so deleting it *before* re-pointing would have deleted the Element too; we
never do that.
"""

from __future__ import annotations

import asyncpg


async def create_element(
    pool: asyncpg.Pool,
    *,
    thread_id: str,
    step_id: str,
    name: str,
    mime: str | None,
    object_key: str,
    size: int | None,
) -> str:
    row = await pool.fetchrow(
        """INSERT INTO "Element" ("threadId", "stepId", "metadata", "mime", "name", "objectKey", "size")
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING "id\"""",
        thread_id,
        step_id,
        {},
        mime,
        name,
        object_key,
        str(size) if size is not None else None,
    )
    assert row is not None
    return row["id"]


async def reassign_step(pool: asyncpg.Pool, element_id: str, new_step_id: str) -> str | None:
    """Point an Element at `new_step_id`, returning the Step id it was
    previously attached to (the placeholder created by `files.confirm`) so
    the caller can decide what, if anything, to do with it.
    """
    row = await pool.fetchrow('SELECT "stepId" FROM "Element" WHERE "id" = $1', element_id)
    if row is None:
        return None
    old_step_id: str | None = row["stepId"]
    await pool.execute('UPDATE "Element" SET "stepId" = $2 WHERE "id" = $1', element_id, new_step_id)
    return old_step_id


async def list_for_thread(pool: asyncpg.Pool, thread_id: str) -> list[asyncpg.Record]:
    return await pool.fetch('SELECT * FROM "Element" WHERE "threadId" = $1', thread_id)


async def get(pool: asyncpg.Pool, element_id: str) -> asyncpg.Record | None:
    return await pool.fetchrow('SELECT * FROM "Element" WHERE "id" = $1', element_id)
