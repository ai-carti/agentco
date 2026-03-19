"""
Tests for ALEX-TD-032..034 tech debt fixes.

ALEX-TD-032: _execute_agent no longer duplicates error handling from execute_run
ALEX-TD-033: stop() respects terminal states (completed/failed/stopped/done)
ALEX-TD-034: EventBus.subscribe() uses bounded asyncio.Queue (maxsize=1000)
"""
import asyncio
import logging
import pytest


# ── ALEX-TD-034: EventBus bounded queue ──────────────────────────────────────

def test_eventbus_queue_has_maxsize():
    """EventBus.subscribe() должен создавать Queue с ограниченным размером."""
    from agentco.core.event_bus import EventBus, _QUEUE_MAXSIZE

    assert _QUEUE_MAXSIZE > 0, "_QUEUE_MAXSIZE должен быть положительным числом"

    bus = EventBus.get()

    async def _check():
        queue_maxsize = None

        async def _subscriber():
            nonlocal queue_maxsize
            async for event in bus.subscribe("test-company-bounded"):
                queue_maxsize = event.get("_maxsize")
                break

        # Subscribe briefly, then publish to trigger the generator
        task = asyncio.create_task(_subscriber())
        await asyncio.sleep(0)  # allow subscriber to register

        # Grab queue maxsize from internal state
        for cid, q in bus._subscribers:
            if cid == "test-company-bounded":
                queue_maxsize = q.maxsize
                break

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

        return queue_maxsize

    result = asyncio.run(_check())
    assert result == _QUEUE_MAXSIZE, (
        f"Expected queue maxsize={_QUEUE_MAXSIZE}, got {result}"
    )


@pytest.mark.asyncio
async def test_eventbus_drops_events_when_queue_full(caplog):
    """Когда очередь заполнена — события дропаются с WARNING, не выбрасывается исключение."""
    from agentco.core.event_bus import EventBus, _QUEUE_MAXSIZE
    from agentco.core import event_bus as eb_module

    # Временно снижаем лимит для теста
    original = eb_module._QUEUE_MAXSIZE
    eb_module._QUEUE_MAXSIZE = 2

    bus = EventBus.get()

    # Создаём очередь с maxsize=2 вручную, добавляем в subscribers
    small_queue: asyncio.Queue = asyncio.Queue(maxsize=2)
    company_id = "test-drop-company"
    entry = (company_id, small_queue)
    bus._subscribers.append(entry)

    try:
        with caplog.at_level(logging.WARNING, logger="agentco.core.event_bus"):
            # Заполняем очередь
            await bus.publish({"type": "evt1", "company_id": company_id})
            await bus.publish({"type": "evt2", "company_id": company_id})
            # Третье событие должно быть дропнуто
            await bus.publish({"type": "evt3_dropped", "company_id": company_id})

        assert small_queue.qsize() == 2, "Очередь должна быть полной (2 события)"
        assert any(
            "queue full" in record.message.lower() for record in caplog.records
        ), "Должен быть WARNING о переполнении очереди"
    finally:
        bus._subscribers.remove(entry)
        eb_module._QUEUE_MAXSIZE = original


# ── ALEX-TD-033: stop() respects terminal states ──────────────────────────────

def _make_session_with_run(status: str):
    """Helper: создаёт in-memory SQLite с одним Run в указанном статусе."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from agentco.orm.base import Base
    import agentco.orm.company
    import agentco.orm.run
    import agentco.orm.user
    import agentco.orm.agent
    import agentco.orm.task
    import agentco.orm.credential
    import agentco.orm.agent_library
    import agentco.orm.mcp_server
    from agentco.orm.company import CompanyORM
    from agentco.orm.user import User
    from agentco.orm.run import RunORM
    import uuid
    from datetime import datetime, timezone

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    user_id = str(uuid.uuid4())
    company_id = str(uuid.uuid4())
    run_id = str(uuid.uuid4())

    user = User(id=user_id, email="test@example.com", hashed_password="x")
    company = CompanyORM(id=company_id, name="TestCo", owner_id=user_id)
    run = RunORM(
        id=run_id,
        company_id=company_id,
        status=status,
        started_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )

    session.add_all([user, company, run])
    session.commit()

    return session, company_id, run_id, user_id


@pytest.mark.parametrize("terminal_status", ["completed", "failed", "stopped", "done"])
def test_stop_does_not_overwrite_terminal_status(terminal_status):
    """stop() не должен перезаписывать финальные статусы."""
    from agentco.services.run import RunService

    session, company_id, run_id, owner_id = _make_session_with_run(terminal_status)

    try:
        service = RunService(session)
        result = service.stop(company_id=company_id, run_id=run_id, owner_id=owner_id)

        assert result.status == terminal_status, (
            f"stop() перезаписал финальный статус {terminal_status!r} → {result.status!r}"
        )
    finally:
        session.close()


def test_stop_active_run_changes_to_stopped():
    """stop() для активного (running) рана должен обновить статус → stopped."""
    from agentco.services.run import RunService

    session, company_id, run_id, owner_id = _make_session_with_run("running")

    try:
        service = RunService(session)
        result = service.stop(company_id=company_id, run_id=run_id, owner_id=owner_id)

        assert result.status == "stopped", (
            f"Ожидали stopped, получили {result.status!r}"
        )
    finally:
        session.close()


def test_stop_pending_run_changes_to_stopped():
    """stop() для pending рана должен обновить статус → stopped."""
    from agentco.services.run import RunService

    session, company_id, run_id, owner_id = _make_session_with_run("pending")

    try:
        service = RunService(session)
        result = service.stop(company_id=company_id, run_id=run_id, owner_id=owner_id)

        assert result.status == "stopped"
    finally:
        session.close()


# ── ALEX-TD-032: _execute_agent no duplicate error handling ──────────────────

@pytest.mark.asyncio
async def test_execute_agent_does_not_duplicate_error_handling():
    """
    ALEX-TD-032: _execute_agent не должен дублировать обработку ошибок из execute_run.
    execute_run() сам ловит ошибки, обновляет статус, публикует run.failed.
    _execute_agent не должен содержать bus.publish() и дополнительные DB-updates.
    """
    import inspect
    from agentco.services.run import RunService

    source = inspect.getsource(RunService._execute_agent)

    # Убеждаемся что нет вызова bus.publish() в _execute_agent
    assert "bus.publish" not in source, (
        "_execute_agent не должен вызывать bus.publish — это делает execute_run(). "
        "Двойной publish создаёт дублирующиеся WebSocket события."
    )

    # Убеждаемся что нет except-блоков с обновлением DB статуса
    assert "run_orm.status" not in source, (
        "_execute_agent не должен обновлять run_orm.status — это делает execute_run(). "
        "Двойные DB writes корромпируют данные."
    )
