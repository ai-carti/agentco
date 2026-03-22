"""
TDD тесты для ALEX-TD-088..092 — Post-Sprint Backend Audit.

ALEX-TD-088 (MEDIUM): PgVectorStore missing threading.Lock
ALEX-TD-089 (LOW): ws_events done-task exceptions not retrieved → "Task exception was never retrieved"
ALEX-TD-090 (LOW): N+1 DELETE in SqliteVecStore.delete_by_agent
ALEX-TD-091 (LOW): Dead code services/memory.py — naming collision with memory/service.py
ALEX-TD-092 (LOW): EventBus._instance singleton has no reset() classmethod

Run: uv run pytest tests/test_alex_td_088_092.py -v
"""
import asyncio
import inspect
import threading
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── ALEX-TD-088: PgVectorStore thread safety ─────────────────────────────────

def test_pg_vector_store_has_threading_lock():
    """
    ALEX-TD-088: PgVectorStore should have _lock = threading.Lock() like SqliteVecStore.
    Without a lock, concurrent run_in_executor calls on the same psycopg2 connection
    can cause ProgrammingError or data corruption.
    """
    from agentco.memory.vector_store import PgVectorStore
    source = inspect.getsource(PgVectorStore)
    assert "threading.Lock()" in source, (
        "PgVectorStore must use threading.Lock() for thread safety. "
        "SqliteVecStore already does this — PgVectorStore must mirror it."
    )
    assert "self._lock" in source, (
        "PgVectorStore must acquire self._lock in insert/search/delete_by_agent methods."
    )


def test_pg_vector_store_lock_in_insert():
    """ALEX-TD-088: PgVectorStore.insert must acquire self._lock."""
    from agentco.memory.vector_store import PgVectorStore
    source = inspect.getsource(PgVectorStore.insert)
    assert "self._lock" in source, (
        "PgVectorStore.insert() must acquire self._lock (with self._lock: ...)"
    )


def test_pg_vector_store_lock_in_search():
    """ALEX-TD-088: PgVectorStore.search must acquire self._lock."""
    from agentco.memory.vector_store import PgVectorStore
    source = inspect.getsource(PgVectorStore.search)
    assert "self._lock" in source, (
        "PgVectorStore.search() must acquire self._lock (with self._lock: ...)"
    )


def test_pg_vector_store_lock_in_delete():
    """ALEX-TD-088: PgVectorStore.delete_by_agent must acquire self._lock."""
    from agentco.memory.vector_store import PgVectorStore
    source = inspect.getsource(PgVectorStore.delete_by_agent)
    assert "self._lock" in source, (
        "PgVectorStore.delete_by_agent() must acquire self._lock"
    )


# ── ALEX-TD-090: N+1 DELETE pattern ─────────────────────────────────────────

def test_delete_by_agent_no_loop_deletes():
    """
    ALEX-TD-090: SqliteVecStore.delete_by_agent should NOT loop N individual DELETEs.
    Instead it should use an IN clause or executemany — O(1) queries regardless of count.
    """
    from agentco.memory.vector_store import SqliteVecStore
    source = inspect.getsource(SqliteVecStore.delete_by_agent)
    # Current bad pattern: for rid in rowid_ids: self._conn.execute("DELETE ... WHERE rowid = ?", [rid])
    assert "for rid in rowid_ids" not in source, (
        "ALEX-TD-090: delete_by_agent must not loop with individual DELETE per row. "
        "Use 'DELETE FROM agent_memories_vec WHERE rowid IN (...)' for batch deletion."
    )


def test_delete_by_agent_uses_in_clause():
    """ALEX-TD-090: SqliteVecStore.delete_by_agent should use IN clause."""
    from agentco.memory.vector_store import SqliteVecStore
    source = inspect.getsource(SqliteVecStore.delete_by_agent)
    assert "IN (" in source or "IN(" in source or "executemany" in source, (
        "ALEX-TD-090: delete_by_agent must use SQL IN clause or executemany for batch deletion."
    )


def test_delete_by_agent_batch_correctness():
    """ALEX-TD-090: After batch refactor, delete_by_agent must still correctly remove all memories."""
    from agentco.memory.vector_store import SqliteVecStore
    store = SqliteVecStore(":memory:")
    embedding = [0.0] * 1536

    # Insert 10 memories for agent-a and 2 for agent-b
    for i in range(10):
        store.insert("agent-a", None, f"memory-{i}", embedding)
    for i in range(2):
        store.insert("agent-b", None, f"other-{i}", embedding)

    # Delete agent-a
    store.delete_by_agent("agent-a")

    # agent-a memories should be gone
    remaining_a = store.get_all("agent-a")
    assert remaining_a == [], f"Expected 0 memories for agent-a after delete, got {len(remaining_a)}"

    # agent-b memories should be untouched
    remaining_b = store.get_all("agent-b")
    assert len(remaining_b) == 2, f"Expected 2 memories for agent-b (untouched), got {len(remaining_b)}"

    store.close()


def test_delete_by_agent_empty_agent_is_noop():
    """ALEX-TD-090: delete_by_agent for agent with no memories should not crash."""
    from agentco.memory.vector_store import SqliteVecStore
    store = SqliteVecStore(":memory:")
    # Should not raise
    store.delete_by_agent("nonexistent-agent")
    store.close()


# ── ALEX-TD-091: Dead code services/memory.py ────────────────────────────────

def test_services_memory_dead_code_removed():
    """
    ALEX-TD-091: agentco/services/memory.py is dead code — marked for deletion in its own docstring.
    It creates a naming collision: agentco.services.memory.MemoryService (legacy, sync, init_schema)
    vs agentco.memory.service.MemoryService (async, production).

    After fix: importing agentco.services.memory should raise ImportError.
    The production path is agentco.memory.service.
    """
    import importlib
    try:
        mod = importlib.import_module("agentco.services.memory")
        # If import succeeded, verify the file is at least a stub (no real MemoryService class)
        # The dead MemoryService has `init_schema` — production one doesn't
        if hasattr(mod, "MemoryService"):
            cls = mod.MemoryService
            assert not hasattr(cls, "init_schema"), (
                "ALEX-TD-091: agentco/services/memory.py is dead code that should be deleted. "
                "It exposes a legacy MemoryService.init_schema() not present in production code. "
                "Delete the file to prevent developers from accidentally importing the wrong class."
            )
    except ImportError:
        pass  # File deleted — test passes


# ── ALEX-TD-092: EventBus singleton reset ────────────────────────────────────

def test_eventbus_has_reset_classmethod():
    """
    ALEX-TD-092: EventBus._instance is a class-level singleton. In test environments where
    REDIS_URL may or may not be set, EventBus._instance can persist across tests carrying
    a stale RedisEventBus. A reset() classmethod allows explicit cleanup.
    """
    from agentco.core.event_bus import EventBus
    assert hasattr(EventBus, "reset"), (
        "ALEX-TD-092: EventBus needs a reset() classmethod to allow tests to clear the singleton. "
        "Add: @classmethod def reset(cls): cls._instance = None"
    )
    assert callable(EventBus.reset), "EventBus.reset must be callable"


def test_eventbus_reset_clears_instance():
    """ALEX-TD-092: EventBus.reset() should set _instance to None."""
    from agentco.core.event_bus import EventBus
    # Force creation of an instance
    _ = EventBus.get()
    assert EventBus._instance is not None

    EventBus.reset()
    assert EventBus._instance is None, (
        "EventBus.reset() must set EventBus._instance = None"
    )


def test_eventbus_reset_allows_fresh_instance():
    """ALEX-TD-092: After reset(), EventBus.get() should return a new instance."""
    from agentco.core.event_bus import EventBus

    EventBus.reset()
    instance1 = EventBus.get()

    EventBus.reset()
    instance2 = EventBus.get()

    assert instance1 is not instance2, (
        "After reset(), EventBus.get() must create a new instance."
    )
    # Cleanup
    EventBus.reset()


# ── ALEX-TD-089: ws_events done-task exceptions not retrieved ────────────────

def test_ws_events_handles_done_task_exceptions():
    """
    ALEX-TD-089: In ws_company_events, after asyncio.wait(FIRST_COMPLETED),
    the 'done' tasks may contain exceptions. Those exceptions must be retrieved
    (task.exception() or task.result()) to prevent "Task exception was never retrieved"
    Python warnings.

    Verify the handler code retrieves exceptions from done tasks.
    """
    from agentco.handlers.ws_events import ws_company_events
    source = inspect.getsource(ws_company_events)

    # The code should handle done tasks, not just pending ones
    # Look for exception handling on done tasks
    has_done_handling = (
        "for task in done" in source
        or ".exception()" in source
        or "task.result()" in source
    )
    assert has_done_handling, (
        "ALEX-TD-089: ws_company_events must handle exceptions from 'done' tasks "
        "after asyncio.wait(FIRST_COMPLETED). Currently only 'pending' tasks are cleaned up. "
        "Add: for task in done: try: task.result() except Exception: logger.debug(...)"
    )
