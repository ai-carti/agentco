"""
Tests for ALEX-TD-083, ALEX-TD-084, ALEX-TD-085 issues found in ALEX-AUDIT-004.

ALEX-TD-083: MemoryService.get_all() is synchronous — blocks event loop if called from async context.
             Test: verify get_all can be called and returns expected type (documents the sync contract).

ALEX-TD-084: ws_events._watch_disconnect() — receive() returns (not raises) on data messages.
             If client sends a data frame (not a disconnect), _watch_disconnect() loop continues
             correctly. Regression test: verify watch_disconnect does NOT terminate on data messages.

ALEX-TD-085: agent_node returns {"status": "error"} instead of re-raising — execute_run does
             not publish run.failed when graph terminates via status=error route.
             Test: verify execute_run publishes run.failed when graph final_state has status="error".
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── ALEX-TD-083: MemoryService.get_all() sync contract ────────────────────────

def test_memory_service_get_all_returns_list():
    """
    ALEX-TD-083: MemoryService.get_all() is synchronous and must return list[dict].
    Documents sync-only contract — must NOT be called from async context directly.
    """
    from agentco.memory.service import MemoryService
    from agentco.memory.vector_store import SqliteVecStore

    store = SqliteVecStore(db_path=":memory:")
    service = MemoryService(store)

    result = service.get_all("agent-test", limit=10, offset=0)
    assert isinstance(result, list)

    service.close()


def test_memory_service_get_all_respects_pagination():
    """ALEX-TD-083: get_all() with limit/offset correctly paginates."""
    from agentco.memory.service import MemoryService
    from agentco.memory.vector_store import SqliteVecStore

    store = SqliteVecStore(db_path=":memory:")
    service = MemoryService(store)

    # Insert a few records directly via store
    embedding = [0.0] * 1536
    for i in range(5):
        store.insert("agent-page", f"task-{i}", f"content {i}", embedding)

    # limit=2 should return 2 items
    result = service.get_all("agent-page", limit=2, offset=0)
    assert len(result) == 2

    # offset=4 should return 1 item
    result2 = service.get_all("agent-page", limit=10, offset=4)
    assert len(result2) == 1

    service.close()


# ── ALEX-TD-084: ws_events — _watch_disconnect must NOT stop on data messages ──

@pytest.mark.asyncio
async def test_watch_disconnect_continues_on_data_message():
    """
    ALEX-TD-084: _watch_disconnect must NOT terminate when websocket.receive()
    returns a data dict (e.g. client sends a ping/heartbeat).
    If it terminates, asyncio.wait(FIRST_COMPLETED) will cancel forward_task →
    WS connection closed on first client message.

    The fix: _watch_disconnect() must only stop on WebSocketDisconnect,
    not on normal receive() returns.
    """
    from fastapi import WebSocketDisconnect

    company_id = "company-data-msg"
    owner_id = "user-data"
    valid_token = "valid.token"

    from agentco.core.event_bus import EventBus, InProcessEventBus

    bus = InProcessEventBus()
    EventBus._instance = bus

    # Simulate: 3 data messages, then disconnect
    receive_calls = {"count": 0}

    async def _receive_with_data():
        receive_calls["count"] += 1
        if receive_calls["count"] < 4:
            # Return a data dict (non-disconnect receive return)
            return {"type": "websocket.receive", "text": "ping"}
        raise WebSocketDisconnect(code=1000)

    ws = MagicMock()
    ws.accept = AsyncMock(return_value=None)
    ws.close = AsyncMock(return_value=None)
    ws.send_json = AsyncMock(return_value=None)
    ws.receive = _receive_with_data

    company_orm = MagicMock()
    company_orm.id = company_id
    company_orm.owner_id = owner_id
    mock_session = MagicMock()
    mock_scalars = MagicMock()
    mock_scalars.first.return_value = company_orm
    mock_session.scalars.return_value = mock_scalars

    from agentco.handlers.ws_events import ws_company_events

    with (
        patch("agentco.handlers.ws_events.decode_access_token", return_value=owner_id),
        patch("agentco.handlers.ws_events.EventBus.get", return_value=bus),
    ):
        await ws_company_events(
            websocket=ws,
            company_id=company_id,
            token=valid_token,
            session=mock_session,
        )

    # Must have received all 4 calls (3 data + 1 disconnect), not just 1
    assert receive_calls["count"] == 4, (
        f"_watch_disconnect terminated early after {receive_calls['count']} receive() calls "
        f"(expected 4: 3 data messages + 1 disconnect). "
        f"This means the WS connection was incorrectly closed on first data message."
    )

    # Subscriber must be cleaned up
    assert len(bus._subscribers) == 0


# ── ALEX-TD-085: agent_node error does not trigger run.failed in execute_run ──

@pytest.mark.asyncio
async def test_execute_run_publishes_run_failed_on_graph_error_status(monkeypatch, tmp_path):
    """
    ALEX-TD-085: When agent_node returns {"status": "error", "error": "..."}
    and the graph terminates via should_continue → END (status=error),
    execute_run must publish run.failed, NOT run.completed.
    """
    from agentco.services.run import RunService
    from agentco.core.event_bus import EventBus, InProcessEventBus

    bus = InProcessEventBus()
    monkeypatch.setattr("agentco.core.event_bus.EventBus._instance", bus)
    monkeypatch.setattr("agentco.eventbus.EventBus._instance", bus)

    published_events = []

    async def _capture_publish(event: dict) -> None:
        published_events.append(event)

    monkeypatch.setattr(bus, "publish", _capture_publish)

    # Graph returns status="error" (from agent_node exception catch)
    async def _mock_ainvoke(state, config=None):
        return {
            **state,
            "status": "error",
            "error": "LLM call failed: timeout",
            "final_result": None,
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
    async def _mock_checkpointer():
        yield MagicMock()

    monkeypatch.setattr(
        "agentco.orchestration.checkpointer.create_checkpointer",
        _mock_checkpointer,
    )

    # Setup minimal DB
    import os
    db_path = str(tmp_path / "test.db")
    monkeypatch.setenv("AGENTCO_DB_PATH", f"sqlite:///{db_path}")

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from agentco.orm.base import Base
    import agentco.orm.company     # noqa: F401
    import agentco.orm.agent       # noqa: F401
    import agentco.orm.task        # noqa: F401
    import agentco.orm.run         # noqa: F401
    import agentco.orm.user        # noqa: F401
    import agentco.orm.credential  # noqa: F401

    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    # Seed run
    session = Session()
    from agentco.orm.run import RunORM
    import uuid
    run_id = str(uuid.uuid4())
    run_orm = RunORM(
        id=run_id,
        company_id="company-error",
        status="pending",
        goal="test goal",
    )
    session.add(run_orm)
    session.commit()
    session.close()

    # Execute
    svc_session = Session()
    svc = RunService(svc_session)

    from agentco.repositories.run import RunRepository
    svc._repo = RunRepository(svc_session)

    await svc.execute_run(run_id=run_id, session_factory=Session)
    svc_session.close()

    # Verify run.failed was published (not run.completed)
    event_types = [e["type"] for e in published_events]
    assert "run.failed" in event_types, (
        f"run.failed not published when graph returned status=error. "
        f"Events: {event_types}"
    )
    assert "run.completed" not in event_types, (
        f"run.completed must NOT be published for status=error. "
        f"Events: {event_types}"
    )


# ── Cleanup ─────────────────────────────────────────────────────────────────

def teardown_module(module):
    from agentco.core.event_bus import EventBus
    EventBus._instance = None
