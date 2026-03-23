"""
Tests for ALEX-TD-084 and ALEX-TD-086 tech debt fixes.

ALEX-TD-084: execute_run() publishes run.failed (not run.completed) when
             LangGraph returns final_status in ("failed", "error").
             Affected scenario: loop_detected, cost_limit_exceeded.

ALEX-TD-086: subagent_node checks MAX_COST_USD in addition to MAX_ITERATIONS.
             Previously only CEO node had cost limit check — subagent could
             overspend undetected.
"""
import asyncio
import pytest

from agentco.orchestration.state import AgentState


# ── ALEX-TD-084: run.completed vs run.failed dispatch ────────────────────────

@pytest.mark.asyncio
async def test_execute_run_publishes_run_failed_on_graph_failed_status(monkeypatch, tmp_path):
    """When graph returns status='failed', execute_run should publish run.failed not run.completed."""
    from agentco.services.run import RunService
    from agentco.core.event_bus import EventBus, InProcessEventBus

    # Use a fresh in-process bus
    bus = InProcessEventBus()
    monkeypatch.setattr("agentco.core.event_bus.EventBus._instance", bus)
    monkeypatch.setattr("agentco.eventbus.EventBus._instance", bus)

    published_events = []

    async def _capture_publish(event: dict) -> None:
        published_events.append(event)

    monkeypatch.setattr(bus, "publish", _capture_publish)

    # Mock the graph compile to return a graph that produces failed status
    async def _mock_ainvoke(state, config=None):
        return {
            **state,
            "status": "failed",
            "error": "loop_detected",
            "final_result": None,
        }

    class _MockGraph:
        async def ainvoke(self, state, config=None):
            return await _mock_ainvoke(state, config)

    # ALEX-TD-147 fix: patch agentco.services.run.compile_graph (actual reference used
    # in execute_run via _run_mod.compile_graph), not agentco.orchestration.graph.compile.
    monkeypatch.setattr(
        "agentco.services.run.compile_graph",
        lambda checkpointer=None: _MockGraph(),
    )

    # Mock checkpointer context manager
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _mock_checkpointer(db_path=None):
        class _FakeCheckpointer:
            pass
        yield _FakeCheckpointer()

    monkeypatch.setattr("agentco.services.run.create_checkpointer", _mock_checkpointer)

    # Create a minimal Run ORM mock
    import uuid
    _run_id = str(uuid.uuid4())
    _company_id = "company-test-084"

    class _FakeRunORM:
        id = _run_id
        company_id = _company_id
        goal = "test goal"
        task_id = None
        status = "pending"
        error = None
        result = None
        completed_at = None

    # Session factory mock
    class _FakeSession:
        def get(self, model, rid):
            if rid == _run_id:
                return _FakeRunORM()
            return None

        def commit(self):
            pass

        def close(self):
            pass

    def _session_factory():
        return _FakeSession()

    svc = RunService(_FakeSession())

    # ALEX-TD-147: patch MemoryService to avoid real sqlite connection in test
    from unittest.mock import MagicMock, patch
    _fake_ms = MagicMock()
    _fake_ms.close = MagicMock()

    with patch("agentco.services.run.MemoryService", return_value=_fake_ms):
        try:
            await svc.execute_run(_run_id, session_factory=_session_factory)
        except Exception:
            pass  # expected — re-raise from failed status

    event_types = [e["type"] for e in published_events]

    # Should have run.status_changed + run.failed (NOT run.completed)
    assert "run.failed" in event_types, (
        f"Expected run.failed event when graph returns status=failed. Got: {event_types}"
    )
    assert "run.completed" not in event_types, (
        f"Should NOT publish run.completed when graph returns status=failed. Got: {event_types}"
    )


@pytest.mark.asyncio
async def test_execute_run_publishes_run_completed_on_graph_completed_status(monkeypatch):
    """When graph returns status='completed', execute_run should publish run.completed."""
    from agentco.core.event_bus import InProcessEventBus

    bus = InProcessEventBus()
    monkeypatch.setattr("agentco.core.event_bus.EventBus._instance", bus)
    monkeypatch.setattr("agentco.eventbus.EventBus._instance", bus)

    published_events = []

    async def _capture_publish(event: dict) -> None:
        published_events.append(event)

    monkeypatch.setattr(bus, "publish", _capture_publish)

    async def _mock_ainvoke(state, config=None):
        return {
            **state,
            "status": "completed",
            "final_result": "Task done successfully",
        }

    class _MockGraph:
        async def ainvoke(self, state, config=None):
            return await _mock_ainvoke(state, config)

    monkeypatch.setattr(
        "agentco.orchestration.graph.compile",
        lambda checkpointer=None: _MockGraph(),
    )

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _mock_checkpointer(db_path=None):
        class _FakeCheckpointer:
            pass
        yield _FakeCheckpointer()

    monkeypatch.setattr("agentco.orchestration.checkpointer.create_checkpointer", _mock_checkpointer)

    import uuid
    from agentco.services.run import RunService
    _run_id = str(uuid.uuid4())
    _company_id = "company-test-084b"

    class _FakeRunORM:
        id = _run_id
        company_id = _company_id
        goal = "test goal"
        task_id = None
        status = "pending"
        error = None
        result = None
        completed_at = None

    class _FakeSession:
        def get(self, model, rid):
            if rid == _run_id:
                return _FakeRunORM()
            return None

        def commit(self):
            pass

        def close(self):
            pass

    def _session_factory():
        return _FakeSession()

    svc = RunService(_FakeSession())
    await svc.execute_run(_run_id, session_factory=_session_factory)

    event_types = [e["type"] for e in published_events]

    assert "run.completed" in event_types, (
        f"Expected run.completed event when graph returns status=completed. Got: {event_types}"
    )
    assert "run.failed" not in event_types, (
        f"Should NOT publish run.failed when graph returns status=completed. Got: {event_types}"
    )


# ── ALEX-TD-086: subagent_node cost check ────────────────────────────────────

@pytest.mark.asyncio
async def test_subagent_node_stops_on_cost_limit(monkeypatch):
    """subagent_node should return status=failed when cost limit is exceeded."""
    import os
    from agentco.orchestration.nodes import subagent_node

    # Set cost limit to 0.0001 USD — well below any realistic cost
    monkeypatch.setenv("MAX_RUN_COST_USD", "0.0001")

    state: AgentState = {
        "run_id": "test-run",
        "company_id": "company-test",
        "input": "test task",
        "messages": [],
        "pending_tasks": [
            {
                "task_id": "task-1",
                "from_agent_id": "ceo",
                "to_agent_id": "subagent",
                "description": "Do something expensive",
                "context": {},
                "depth": 1,
            }
        ],
        "active_tasks": {},
        "results": {},
        "iteration_count": 0,
        "total_tokens": 0,
        "total_cost_usd": 999.99,  # WAY over limit
        "status": "running",
        "error": None,
        "final_result": None,
        "agent_id": "subagent",
        "level": 1,
    }

    result = await subagent_node(state)

    assert result.get("status") == "failed", (
        f"Expected status=failed when cost limit exceeded. Got: {result.get('status')}"
    )
    assert result.get("error") == "cost_limit_exceeded", (
        f"Expected error=cost_limit_exceeded. Got: {result.get('error')}"
    )


@pytest.mark.asyncio
async def test_subagent_node_still_checks_iteration_limit():
    """subagent_node should still check MAX_ITERATIONS (regression test)."""
    from agentco.orchestration.nodes import subagent_node

    state: AgentState = {
        "run_id": "test-run",
        "company_id": "company-test",
        "input": "test task",
        "messages": [],
        "pending_tasks": [
            {
                "task_id": "task-1",
                "from_agent_id": "ceo",
                "to_agent_id": "subagent",
                "description": "Do something",
                "context": {},
                "depth": 1,
            }
        ],
        "active_tasks": {},
        "results": {},
        "iteration_count": 9999,  # WAY over MAX_ITERATIONS (20)
        "total_tokens": 0,
        "total_cost_usd": 0.0,   # cost is fine
        "status": "running",
        "error": None,
        "final_result": None,
        "agent_id": "subagent",
        "level": 1,
    }

    result = await subagent_node(state)

    assert result.get("status") == "failed"
    assert result.get("error") == "loop_detected"
