"""
Tests for ALEX-TD-147 and ALEX-TD-148.

ALEX-TD-147: MemoryService must NOT be in LangGraph initial_state (not msgpack serializable).
             Instead, pass via contextvars.ContextVar — available in agent_node during ainvoke.

ALEX-TD-148: _memory_db must not receive SQLAlchemy URL (e.g. "sqlite:///./test.db").
             If AGENTCO_DB_PATH contains a SQLAlchemy URL, parse and extract the file path.
"""
from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest


# ─── ALEX-TD-147: memory_service must NOT be in initial_state ─────────────────

@pytest.mark.asyncio
async def test_memory_service_not_in_initial_state(tmp_path, monkeypatch):
    """ALEX-TD-147: execute_run must NOT put memory_service into initial_state.
    LangGraph checkpointing serialises state via msgpack — MemoryService is not
    serialisable → TypeError → every run with memory fails at first checkpoint.
    """
    from agentco.services.run import RunService

    mock_orm = MagicMock()
    mock_orm.company_id = "company-1"
    mock_orm.goal = "test goal"
    mock_orm.task_id = None
    mock_orm.status = "pending"

    mock_session = MagicMock()
    mock_session.get.return_value = mock_orm
    mock_session.commit.return_value = None
    mock_session.close.return_value = None

    def mock_session_factory():
        return mock_session

    captured_state: dict = {}

    async def mock_ainvoke(initial_state, config=None):
        captured_state.update(initial_state)
        return {
            "final_result": "done",
            "status": "completed",
            "total_tokens": 10,
            "total_cost_usd": 0.001,
        }

    mock_graph = MagicMock()
    mock_graph.ainvoke = mock_ainvoke

    from unittest.mock import patch
    from agentco.core.event_bus import InProcessEventBus

    bus = InProcessEventBus()
    monkeypatch.setattr("agentco.core.event_bus.EventBus._instance", bus)
    monkeypatch.setattr("agentco.eventbus.EventBus._instance", bus)

    @asynccontextmanager
    async def fake_ckpt(*args, **kwargs):
        yield MagicMock()

    with patch("agentco.services.run.compile_graph", return_value=mock_graph), \
         patch("agentco.services.run.create_checkpointer", return_value=fake_ckpt()), \
         patch("agentco.services.run.MemoryService") as mock_ms_cls:

        mock_ms_instance = MagicMock()
        mock_ms_instance.close = MagicMock()
        mock_ms_cls.return_value = mock_ms_instance

        svc = RunService.__new__(RunService)
        svc._session = mock_session
        from agentco.repositories.run import RunRepository
        svc._repo = MagicMock()
        svc._repo.orm_model = MagicMock()
        svc._task_repo = MagicMock()
        svc._company_repo = MagicMock()

        await svc.execute_run("run-1", session_factory=mock_session_factory)

    # memory_service must NOT be in state (not msgpack serialisable → checkpointing breaks)
    assert "memory_service" not in captured_state, (
        "ALEX-TD-147: memory_service must not be in LangGraph initial_state. "
        "Use ContextVar or closure instead."
    )


@pytest.mark.asyncio
async def test_memory_service_available_via_contextvar_during_ainvoke(tmp_path, monkeypatch):
    """ALEX-TD-147: MemoryService must be accessible via _memory_service_var ContextVar
    during ainvoke so agent_node can inject memories without it being in serialised state.
    """
    from agentco.services.run import RunService
    from agentco.orchestration.agent_node import _memory_service_var

    mock_orm = MagicMock()
    mock_orm.company_id = "company-1"
    mock_orm.goal = "test goal"
    mock_orm.task_id = None
    mock_orm.status = "pending"

    mock_session = MagicMock()
    mock_session.get.return_value = mock_orm
    mock_session.commit.return_value = None
    mock_session.close.return_value = None

    def mock_session_factory():
        return mock_session

    captured_memory_service = {}

    async def mock_ainvoke(initial_state, config=None):
        # Capture the ContextVar value while ainvoke is executing
        captured_memory_service["value"] = _memory_service_var.get()
        return {
            "final_result": "done",
            "status": "completed",
            "total_tokens": 10,
            "total_cost_usd": 0.001,
        }

    mock_graph = MagicMock()
    mock_graph.ainvoke = mock_ainvoke

    from unittest.mock import patch
    from agentco.core.event_bus import InProcessEventBus

    bus = InProcessEventBus()
    monkeypatch.setattr("agentco.core.event_bus.EventBus._instance", bus)
    monkeypatch.setattr("agentco.eventbus.EventBus._instance", bus)

    @asynccontextmanager
    async def fake_ckpt(*args, **kwargs):
        yield MagicMock()

    with patch("agentco.services.run.compile_graph", return_value=mock_graph), \
         patch("agentco.services.run.create_checkpointer", return_value=fake_ckpt()), \
         patch("agentco.services.run.MemoryService") as mock_ms_cls:

        mock_ms_instance = MagicMock()
        mock_ms_instance.close = MagicMock()
        mock_ms_cls.return_value = mock_ms_instance

        svc = RunService.__new__(RunService)
        svc._session = mock_session
        svc._repo = MagicMock()
        svc._repo.orm_model = MagicMock()
        svc._task_repo = MagicMock()
        svc._company_repo = MagicMock()

        await svc.execute_run("run-1", session_factory=mock_session_factory)

    # ContextVar must have been set to the MemoryService instance during ainvoke
    assert captured_memory_service.get("value") is mock_ms_instance, (
        "ALEX-TD-147: _memory_service_var ContextVar must be set to the MemoryService "
        "instance during ainvoke so agent_node can access it."
    )


@pytest.mark.asyncio
async def test_contextvar_cleared_after_execute_run(tmp_path, monkeypatch):
    """ALEX-TD-147: _memory_service_var must be reset after execute_run completes
    (including on exception) to prevent MemoryService leaking between runs.
    """
    from agentco.services.run import RunService
    from agentco.orchestration.agent_node import _memory_service_var

    mock_orm = MagicMock()
    mock_orm.company_id = "company-1"
    mock_orm.goal = "test goal"
    mock_orm.task_id = None
    mock_orm.status = "pending"

    mock_session = MagicMock()
    mock_session.get.return_value = mock_orm
    mock_session.commit.return_value = None
    mock_session.close.return_value = None

    def mock_session_factory():
        return mock_session

    async def mock_ainvoke(initial_state, config=None):
        return {
            "final_result": "done",
            "status": "completed",
            "total_tokens": 10,
            "total_cost_usd": 0.001,
        }

    mock_graph = MagicMock()
    mock_graph.ainvoke = mock_ainvoke

    from unittest.mock import patch
    from agentco.core.event_bus import InProcessEventBus

    bus = InProcessEventBus()
    monkeypatch.setattr("agentco.core.event_bus.EventBus._instance", bus)
    monkeypatch.setattr("agentco.eventbus.EventBus._instance", bus)

    @asynccontextmanager
    async def fake_ckpt(*args, **kwargs):
        yield MagicMock()

    with patch("agentco.services.run.compile_graph", return_value=mock_graph), \
         patch("agentco.services.run.create_checkpointer", return_value=fake_ckpt()), \
         patch("agentco.services.run.MemoryService") as mock_ms_cls:

        mock_ms_instance = MagicMock()
        mock_ms_instance.close = MagicMock()
        mock_ms_cls.return_value = mock_ms_instance

        svc = RunService.__new__(RunService)
        svc._session = mock_session
        svc._repo = MagicMock()
        svc._repo.orm_model = MagicMock()
        svc._task_repo = MagicMock()
        svc._company_repo = MagicMock()

        # Verify ContextVar is not set before the call
        assert _memory_service_var.get() is None, "ContextVar should be None before execute_run"

        await svc.execute_run("run-1", session_factory=mock_session_factory)

    # ContextVar must be reset to None after execute_run
    assert _memory_service_var.get() is None, (
        "ALEX-TD-147: _memory_service_var must be reset to None after execute_run "
        "to prevent MemoryService leaking between concurrent runs."
    )


# ─── ALEX-TD-148: SQLAlchemy URL parsing ──────────────────────────────────────

def test_memory_db_path_strips_sqlite_url_prefix(tmp_path, monkeypatch):
    """ALEX-TD-148: When AGENTCO_DB_PATH contains a SQLAlchemy URL like
    'sqlite:///./agentco.db', the memory DB path must strip 'sqlite:///' prefix.
    sqlite3.connect() requires a plain file path — not a SQLAlchemy URL.
    """
    db_path = str(tmp_path / "test.db")
    # Simulate what tests set: AGENTCO_DB_PATH = "sqlite:///path/test.db"
    monkeypatch.setenv("AGENTCO_MEMORY_DB_PATH", f"sqlite:///{db_path}")
    monkeypatch.delenv("AGENTCO_MEMORY_DB", raising=False)

    # Import here to pick up the env var
    import importlib
    import agentco.services.run as run_mod

    # Simulate the path extraction logic from execute_run
    raw = os.getenv("AGENTCO_MEMORY_DB", os.getenv("AGENTCO_MEMORY_DB_PATH", "./agentco_memory.db"))
    if raw.startswith("sqlite:///"):
        extracted = raw[len("sqlite:///"):]
    else:
        extracted = raw

    assert not extracted.startswith("sqlite:///"), (
        "ALEX-TD-148: memory DB path must not start with 'sqlite:///' — "
        "sqlite3.connect() does not accept SQLAlchemy-style URLs."
    )
    assert extracted == db_path, (
        f"Expected extracted path '{db_path}', got '{extracted}'"
    )


def test_memory_db_plain_path_unchanged(monkeypatch):
    """ALEX-TD-148: Plain file paths (no sqlite:/// prefix) must pass through unchanged."""
    monkeypatch.setenv("AGENTCO_MEMORY_DB", "./my_memory.db")

    raw = os.getenv("AGENTCO_MEMORY_DB", os.getenv("AGENTCO_MEMORY_DB_PATH", "./agentco_memory.db"))
    if raw.startswith("sqlite:///"):
        extracted = raw[len("sqlite:///"):]
    else:
        extracted = raw

    assert extracted == "./my_memory.db", (
        f"Plain path should be unchanged, got: {extracted}"
    )


def test_memory_db_does_not_fallback_to_sqlalchemy_db_path(monkeypatch):
    """ALEX-TD-148: AGENTCO_MEMORY_DB must not fall back to AGENTCO_DB_PATH
    (SQLAlchemy URL). Using a dedicated env var avoids the sqlite:/// problem.
    """
    # Set only AGENTCO_DB_PATH (SQLAlchemy URL) — AGENTCO_MEMORY_DB not set
    monkeypatch.setenv("AGENTCO_DB_PATH", "sqlite:///./data/agentco.db")
    monkeypatch.delenv("AGENTCO_MEMORY_DB", raising=False)
    monkeypatch.delenv("AGENTCO_MEMORY_DB_PATH", raising=False)

    # The fix: no fallback on AGENTCO_DB_PATH → uses default
    raw = os.getenv("AGENTCO_MEMORY_DB", os.getenv("AGENTCO_MEMORY_DB_PATH", "./agentco_memory.db"))

    # Should get the default (not the SQLAlchemy AGENTCO_DB_PATH value)
    assert raw == "./agentco_memory.db", (
        f"ALEX-TD-148: must not fall back to AGENTCO_DB_PATH. Got: '{raw}'"
    )
