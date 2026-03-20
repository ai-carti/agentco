"""
Tests for ALEX-POST-005: LangGraph checkpointing persistence

AC:
- LangGraph checkpointer switched from MemorySaver to SqliteSaver (path from env or default data/checkpoints.db)
- On restart progress of unfinished runs is restored
- CHECKPOINT_DB_PATH added to .env.example
- Tests pass with SqliteSaver
"""
import os
import pytest


# ─── Test: CHECKPOINT_DB_PATH env var is read ──────────────────────────────

def test_get_checkpoint_db_path_default():
    """Default checkpoint DB path is data/checkpoints.db."""
    from agentco.orchestration.checkpointer import get_checkpoint_db_path
    # When env var not set, default should be used
    saved = os.environ.pop("CHECKPOINT_DB_PATH", None)
    try:
        path = get_checkpoint_db_path()
        assert "checkpoints" in path or "agentco" in path
    finally:
        if saved is not None:
            os.environ["CHECKPOINT_DB_PATH"] = saved


def test_get_checkpoint_db_path_from_env(tmp_path):
    """CHECKPOINT_DB_PATH env var is respected."""
    from agentco.orchestration.checkpointer import get_checkpoint_db_path
    custom = str(tmp_path / "my_checkpoints.db")
    os.environ["CHECKPOINT_DB_PATH"] = custom
    try:
        path = get_checkpoint_db_path()
        assert path == custom
    finally:
        del os.environ["CHECKPOINT_DB_PATH"]


# ─── Test: create_checkpointer uses configured path ────────────────────────

@pytest.mark.asyncio
async def test_create_checkpointer_uses_env_path(tmp_path):
    """create_checkpointer() uses CHECKPOINT_DB_PATH when set."""
    from agentco.orchestration.checkpointer import create_checkpointer
    db_path = str(tmp_path / "test_checkpoints.db")
    os.environ["CHECKPOINT_DB_PATH"] = db_path
    try:
        async with create_checkpointer() as cp:
            assert cp is not None
        assert os.path.exists(db_path)
    finally:
        del os.environ["CHECKPOINT_DB_PATH"]


@pytest.mark.asyncio
async def test_create_checkpointer_explicit_path(tmp_path):
    """create_checkpointer(path) uses provided path."""
    from agentco.orchestration.checkpointer import create_checkpointer
    db_path = str(tmp_path / "explicit.db")
    async with create_checkpointer(db_path) as cp:
        assert cp is not None
    assert os.path.exists(db_path)


# ─── Test: graph compiles and runs with SqliteSaver ────────────────────────

@pytest.mark.asyncio
async def test_graph_compiles_with_checkpointer(tmp_path):
    """Graph compiled with SqliteSaver checkpointer runs successfully."""
    from agentco.orchestration.graph import compile as compile_graph
    from agentco.orchestration.checkpointer import create_checkpointer

    db_path = str(tmp_path / "graph_test.db")
    async with create_checkpointer(db_path) as cp:
        compiled = compile_graph(checkpointer=cp)
        assert compiled is not None

        state = {
            "run_id": "test-run-001",
            "company_id": "company-001",
            "input": "test task",
            "messages": [],
            "pending_tasks": [],
            "active_tasks": {},
            "results": {},
            "iteration_count": 0,
            "total_tokens": 0,
            "total_cost_usd": 0.0,
            "status": "running",
            "error": None,
            "final_result": None,
            "agent_id": "ceo",
            "level": 0,
        }
        config = {"configurable": {"thread_id": "test-run-001"}}
        result = await compiled.ainvoke(state, config=config)
        assert result is not None
        assert result.get("status") in ("completed", "failed", "error", "done")


@pytest.mark.asyncio
async def test_checkpoint_persists_state(tmp_path):
    """State is persisted to SQLite and can be restored after restart."""
    from agentco.orchestration.graph import compile as compile_graph
    from agentco.orchestration.checkpointer import create_checkpointer

    db_path = str(tmp_path / "persist_test.db")
    thread_id = "persist-run-001"

    # Run graph once and complete
    async with create_checkpointer(db_path) as cp:
        compiled = compile_graph(checkpointer=cp)
        state = {
            "run_id": thread_id,
            "company_id": "company-persist",
            "input": "persistence test",
            "messages": [],
            "pending_tasks": [],
            "active_tasks": {},
            "results": {},
            "iteration_count": 0,
            "total_tokens": 0,
            "total_cost_usd": 0.0,
            "status": "running",
            "error": None,
            "final_result": None,
            "agent_id": "ceo",
            "level": 0,
        }
        config = {"configurable": {"thread_id": thread_id}}
        result1 = await compiled.ainvoke(state, config=config)

    # "Restart": open same DB file again — checkpoint data should still be there
    assert os.path.exists(db_path)
    async with create_checkpointer(db_path) as cp2:
        compiled2 = compile_graph(checkpointer=cp2)
        # get_state should return saved checkpoint (no KeyError / no empty)
        saved_state = await compiled2.aget_state({"configurable": {"thread_id": thread_id}})
        assert saved_state is not None
        # values must match what we had at the end of the run
        assert saved_state.values.get("run_id") == thread_id


# ─── Test: default path creates parent dirs ────────────────────────────────

@pytest.mark.asyncio
async def test_create_checkpointer_creates_parent_dir(tmp_path):
    """create_checkpointer creates parent directories if needed."""
    from agentco.orchestration.checkpointer import create_checkpointer
    db_path = str(tmp_path / "subdir" / "deep" / "checkpoints.db")
    async with create_checkpointer(db_path) as cp:
        assert cp is not None
    assert os.path.exists(db_path)
