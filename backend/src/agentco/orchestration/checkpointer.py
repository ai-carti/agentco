"""
orchestration/checkpointer.py — AsyncSqliteSaver factory для LangGraph checkpointing.

Использование:
    async with create_checkpointer() as checkpointer:
        compiled = graph.compile(checkpointer=checkpointer)
        await compiled.ainvoke(state, config={"configurable": {"thread_id": run_id}})
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver


def get_checkpoint_db_path() -> str:
    """Return checkpoint DB path from env or default."""
    return os.getenv("CHECKPOINT_DB_PATH", "data/checkpoints.db")


@asynccontextmanager
async def create_checkpointer(db_path: str | None = None) -> AsyncIterator[AsyncSqliteSaver]:
    """
    Async context manager для создания AsyncSqliteSaver.

    Примеры:
        async with create_checkpointer() as cp:
            compiled = graph.compile(checkpointer=cp)
            ...
    """
    if db_path is None:
        db_path = get_checkpoint_db_path()
    # Ensure parent dir exists
    import pathlib
    pathlib.Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(db_path) as conn:
        # Включаем WAL mode для concurrent reads
        await conn.execute("PRAGMA journal_mode=WAL")
        await conn.commit()

        checkpointer = AsyncSqliteSaver(conn)
        await checkpointer.setup()
        yield checkpointer
