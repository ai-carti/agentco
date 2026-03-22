"""
BUG-064: subscriber leak on silent TCP disconnect (ALEX-TD-081 regression test).

Scenario: клиент drop TCP без WS close frame →
  _watch_disconnect() raises WebSocketDisconnect →
  forward_task отменяется →
  InProcessEventBus._subscribers очищается.

Тест вызывает ws_company_events handler напрямую через async mock,
минуя HTTP-слой (не нужен TestClient — чистый unit-test уровня handler).
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agentco.core.event_bus import EventBus, InProcessEventBus
from agentco.handlers.ws_events import ws_company_events


# ── helpers ────────────────────────────────────────────────────────────────

def _make_ws(company_id: str = "company-test") -> MagicMock:
    """Build a minimal WebSocket mock.

    - accept()    → coroutine, returns None (handshake)
    - close()     → coroutine, returns None
    - receive()   → first call blocks a bit then raises WebSocketDisconnect
    - send_json() → coroutine, records calls
    """
    from fastapi import WebSocketDisconnect as _WSD

    ws = MagicMock()
    ws.accept = AsyncMock(return_value=None)
    ws.close = AsyncMock(return_value=None)
    ws.send_json = AsyncMock(return_value=None)

    call_count = {"n": 0}

    async def _receive():
        call_count["n"] += 1
        # Simulate silent TCP drop: block briefly then raise WebSocketDisconnect
        await asyncio.sleep(0.05)
        raise _WSD(code=1006)

    ws.receive = _receive
    return ws


def _make_company_orm(company_id: str, owner_id: str) -> MagicMock:
    c = MagicMock()
    c.id = company_id
    c.owner_id = owner_id
    return c


# ── fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def fresh_event_bus():
    """Isolate EventBus singleton per test."""
    EventBus._instance = None
    yield
    EventBus._instance = None


# ── tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_subscriber_removed_after_silent_disconnect():
    """
    Core BUG-064 scenario:
      silent TCP disconnect → WebSocketDisconnect в receive() →
      forward_task отменён → subscriber НЕ остаётся в _subscribers.
    """
    company_id = "company-silent"
    owner_id = "user-1"
    valid_token = "valid.jwt.token"

    # Fresh in-process bus
    bus = InProcessEventBus()
    EventBus._instance = bus

    ws = _make_ws(company_id)

    company_orm = _make_company_orm(company_id, owner_id)

    # Mock session that returns our company
    mock_session = MagicMock()
    mock_scalars = MagicMock()
    mock_scalars.first.return_value = company_orm
    mock_session.scalars.return_value = mock_scalars

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

    # After handler returns, subscribers list must be empty
    assert len(bus._subscribers) == 0, (
        f"Subscriber leak! _subscribers still has {len(bus._subscribers)} entry(ies) "
        f"after silent disconnect: {bus._subscribers}"
    )


@pytest.mark.asyncio
async def test_subscriber_count_decreases_after_disconnect():
    """
    Verify the subscriber count decreases exactly by 1 after disconnect,
    even when another subscriber is still active.
    """
    company_id = "company-multi"
    owner_id = "user-2"
    valid_token = "valid.jwt.token"

    bus = InProcessEventBus()
    EventBus._instance = bus

    # Pre-register a persistent subscriber for a different company
    persistent_queue: asyncio.Queue = asyncio.Queue()
    bus._subscribers.append(("company-other", persistent_queue))
    assert len(bus._subscribers) == 1

    ws = _make_ws(company_id)

    company_orm = _make_company_orm(company_id, owner_id)
    mock_session = MagicMock()
    mock_scalars = MagicMock()
    mock_scalars.first.return_value = company_orm
    mock_session.scalars.return_value = mock_scalars

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

    # The persistent subscriber from 'company-other' must remain; the disconnected one must be gone
    assert len(bus._subscribers) == 1, (
        f"Expected 1 subscriber (the persistent one), got {len(bus._subscribers)}"
    )
    remaining_company_ids = [cid for cid, _ in bus._subscribers]
    assert "company-other" in remaining_company_ids
    assert company_id not in remaining_company_ids


@pytest.mark.asyncio
async def test_forward_task_cancelled_after_disconnect():
    """
    After silent disconnect, the _forward_events task must be cancelled/done —
    not left running indefinitely.
    """
    company_id = "company-cancel"
    owner_id = "user-3"
    valid_token = "valid.jwt.token"

    bus = InProcessEventBus()
    EventBus._instance = bus

    ws = _make_ws(company_id)

    company_orm = _make_company_orm(company_id, owner_id)
    mock_session = MagicMock()
    mock_scalars = MagicMock()
    mock_scalars.first.return_value = company_orm
    mock_session.scalars.return_value = mock_scalars

    running_tasks_before = len(asyncio.all_tasks())

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

    # Give event loop a tick to finalize cancellations
    await asyncio.sleep(0)

    # No lingering forward/watch tasks from our handler
    tasks_after = asyncio.all_tasks()
    lingering = [t for t in tasks_after if not t.done()]
    # All tasks that were running before should not have grown (no leaks)
    assert len(lingering) <= running_tasks_before, (
        f"Lingering tasks after disconnect: {lingering}"
    )

    # Bus must be clean
    assert len(bus._subscribers) == 0
