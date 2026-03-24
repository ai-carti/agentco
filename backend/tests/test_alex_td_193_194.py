"""
Tests for ALEX-TD-193 and ALEX-TD-194.

ALEX-TD-193: services/run.py:execute_run — error field not persisted when graph
returns status=failed/error (loop_detected, cost_limit_exceeded, token_limit_exceeded).
run_orm.error stays None in DB → frontend shows empty error field.

ALEX-TD-194: services/agent.py:AgentService.delete — N+1 UPDATE queries when
nullifying task.agent_id. Python loop over lazy-loaded relationship issues N UPDATEs.
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import create_engine, event as sa_event, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from agentco.orm.base import Base
import agentco.orm.company     # noqa: F401
import agentco.orm.agent       # noqa: F401
import agentco.orm.task        # noqa: F401
import agentco.orm.run         # noqa: F401
import agentco.orm.user        # noqa: F401
import agentco.orm.credential  # noqa: F401
import agentco.orm.agent_library  # noqa: F401
import agentco.orm.mcp_server     # noqa: F401


def _make_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @sa_event.listens_for(engine, "connect")
    def set_pragmas(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()

    Base.metadata.create_all(engine)
    return engine


# ─── ALEX-TD-193 ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_execute_run_persists_error_field_on_loop_detected(tmp_path, monkeypatch):
    """ALEX-TD-193: when graph returns status=failed + error='loop_detected',
    run_orm.error must be persisted to DB (previously stayed None)."""
    from agentco.services.run import RunService
    from agentco.orm.run import RunORM
    from agentco.core.event_bus import EventBus, InProcessEventBus

    bus = InProcessEventBus()
    monkeypatch.setattr("agentco.core.event_bus.EventBus._instance", bus)

    engine = _make_engine()
    Session = sessionmaker(bind=engine)
    run_id = str(uuid.uuid4())
    company_id = str(uuid.uuid4())

    # Create run in DB
    with Session() as s:
        run_orm = RunORM(id=run_id, company_id=company_id, goal="test goal", status="pending")
        s.add(run_orm)
        s.commit()

    fake_final_state = {
        "status": "failed",
        "error": "loop_detected",
        "final_result": "",
        "total_tokens": 10,
        "total_cost_usd": 0.01,
    }

    mock_checkpointer = AsyncMock()
    mock_checkpointer.__aenter__ = AsyncMock(return_value=mock_checkpointer)
    mock_checkpointer.__aexit__ = AsyncMock(return_value=None)

    mock_graph = MagicMock()
    mock_graph.ainvoke = AsyncMock(return_value=fake_final_state)

    mock_memory = MagicMock()
    mock_memory.close = MagicMock()

    with (
        patch("agentco.services.run.compile_graph", return_value=mock_graph),
        patch("agentco.services.run.create_checkpointer", return_value=mock_checkpointer),
        patch("agentco.services.run.MemoryService", return_value=mock_memory),
    ):
        svc_session = Session()
        try:
            service = RunService(svc_session)
            # execute_run publishes run.failed then re-raises in the except block
            try:
                await service.execute_run(run_id=run_id, session_factory=Session)
            except Exception:
                pass  # expected: run.failed event is published then exc re-raised
        finally:
            svc_session.close()

    # Re-fetch from DB to verify persistence
    with Session() as s:
        refreshed = s.get(RunORM, run_id)
        assert refreshed is not None
        # ALEX-TD-193: error field must be persisted when graph status=failed/error
        assert refreshed.error == "loop_detected", (
            f"Expected run_orm.error='loop_detected', got {refreshed.error!r}. "
            "ALEX-TD-193: execute_run success path does not persist error field."
        )
        assert refreshed.status in ("failed", "error")


@pytest.mark.asyncio
async def test_execute_run_persists_error_field_on_cost_limit_exceeded(monkeypatch):
    """ALEX-TD-193: cost_limit_exceeded error also must be persisted to run_orm.error."""
    from agentco.services.run import RunService
    from agentco.orm.run import RunORM
    from agentco.core.event_bus import EventBus, InProcessEventBus

    bus = InProcessEventBus()
    monkeypatch.setattr("agentco.core.event_bus.EventBus._instance", bus)

    engine = _make_engine()
    Session = sessionmaker(bind=engine)
    run_id = str(uuid.uuid4())
    company_id = str(uuid.uuid4())

    with Session() as s:
        run_orm = RunORM(id=run_id, company_id=company_id, goal="cost test", status="pending")
        s.add(run_orm)
        s.commit()

    fake_final_state = {
        "status": "error",
        "error": "cost_limit_exceeded",
        "final_result": None,
        "total_tokens": 100000,
        "total_cost_usd": 5.0,
    }

    mock_checkpointer = AsyncMock()
    mock_checkpointer.__aenter__ = AsyncMock(return_value=mock_checkpointer)
    mock_checkpointer.__aexit__ = AsyncMock(return_value=None)

    mock_graph = MagicMock()
    mock_graph.ainvoke = AsyncMock(return_value=fake_final_state)

    mock_memory = MagicMock()
    mock_memory.close = MagicMock()

    with (
        patch("agentco.services.run.compile_graph", return_value=mock_graph),
        patch("agentco.services.run.create_checkpointer", return_value=mock_checkpointer),
        patch("agentco.services.run.MemoryService", return_value=mock_memory),
    ):
        svc_session = Session()
        try:
            service = RunService(svc_session)
            try:
                await service.execute_run(run_id=run_id, session_factory=Session)
            except Exception:
                pass
        finally:
            svc_session.close()

    with Session() as s:
        refreshed = s.get(RunORM, run_id)
        assert refreshed is not None
        assert refreshed.error == "cost_limit_exceeded", (
            f"Expected run_orm.error='cost_limit_exceeded', got {refreshed.error!r}. "
            "ALEX-TD-193: execute_run success path does not persist error field."
        )


# ─── ALEX-TD-194 ─────────────────────────────────────────────────────────────


def test_delete_agent_nullifies_tasks_correctly(monkeypatch):
    """ALEX-TD-194: AgentService.delete() must nullify task.agent_id for all tasks
    of the agent. Verify correctness (the behaviour test)."""
    from agentco.orm.company import CompanyORM
    from agentco.orm.agent import AgentORM
    from agentco.orm.task import TaskORM
    from agentco.orm.user import UserORM
    from agentco.services.agent import AgentService

    engine = _make_engine()
    Session = sessionmaker(bind=engine)

    user_id = str(uuid.uuid4())
    company_id = str(uuid.uuid4())
    agent_id = str(uuid.uuid4())

    with Session() as s:
        user = UserORM(id=user_id, email=f"{user_id}@test.com", hashed_password="x")
        company = CompanyORM(id=company_id, name="Test Co", owner_id=user_id)
        agent = AgentORM(id=agent_id, company_id=company_id, name="Test Agent", model="gpt-4o-mini")
        s.add_all([user, company, agent])
        s.flush()

        task_ids = [str(uuid.uuid4()) for _ in range(3)]
        for tid in task_ids:
            task = TaskORM(id=tid, company_id=company_id, agent_id=agent_id, title=f"Task {tid}")
            s.add(task)
        s.commit()

    with Session() as s:
        service = AgentService(s)
        service.delete(company_id=company_id, agent_id=agent_id, owner_id=user_id)

    # Verify tasks still exist but agent_id is nullified
    with Session() as s:
        tasks = s.scalars(select(TaskORM).where(TaskORM.id.in_(task_ids))).all()
        assert len(tasks) == 3, f"Expected 3 tasks, got {len(tasks)}"
        for t in tasks:
            assert t.agent_id is None, f"Task {t.id} still has agent_id={t.agent_id!r}"

        # Verify agent is deleted
        assert s.get(AgentORM, agent_id) is None, "Agent should be deleted"
