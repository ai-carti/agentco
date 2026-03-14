"""
orchestration/checkpointer.py — AsyncSqliteSaver factory для LangGraph checkpointing.

Использование:
    async with create_checkpointer("agentco.db") as checkpointer:
        compiled = graph.compile(checkpointer=checkpointer)
        await compiled.ainvoke(state, config={"configurable": {"thread_id": run_id}})
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver


@asynccontextmanager
async def create_checkpointer(db_path: str = "agentco.db") -> AsyncIterator[AsyncSqliteSaver]:
    """
    Async context manager для создания AsyncSqliteSaver.

    Примеры:
        async with create_checkpointer("agentco.db") as cp:
            compiled = graph.compile(checkpointer=cp)
            ...
    """
    async with aiosqlite.connect(db_path) as conn:
        # Включаем WAL mode для concurrent reads
        await conn.execute("PRAGMA journal_mode=WAL")
        await conn.commit()

        checkpointer = AsyncSqliteSaver(conn)
        await checkpointer.setup()
        yield checkpointer
