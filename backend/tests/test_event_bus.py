"""
Tests for EventBus (M2-005).

Unit tests for EventBus class + WebSocket integration tests.
"""
import asyncio
import uuid
import pytest
from unittest.mock import patch, AsyncMock

from starlette.testclient import TestClient

from agentco.core.event_bus import EventBus


# ── EventBus unit tests ─────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def reset_event_bus():
    """Reset EventBus singleton between tests."""
    EventBus._instance = None
    EventBus._subscribers = []
    yield
    EventBus._instance = None
    EventBus._subscribers = []


class TestEventBusUnit:
    """EventBus core functionality."""

    def test_singleton(self):
        """EventBus.get() always returns the same instance."""
        a = EventBus.get()
        b = EventBus.get()
        assert a is b

    @pytest.mark.asyncio
    async def test_publish_and_subscribe(self):
        """Published event is received by subscriber."""
        bus = EventBus.get()
        event = {"type": "run.started", "company_id": "c1", "run_id": "r1", "payload": {}}

        received = []

        async def consume():
            async for ev in bus.subscribe("c1"):
                received.append(ev)
                break  # one event is enough

        task = asyncio.create_task(consume())
        await asyncio.sleep(0)  # let consumer start
        await bus.publish(event)
        await asyncio.wait_for(task, timeout=1.0)

        assert len(received) == 1
        assert received[0] == event

    @pytest.mark.asyncio
    async def test_subscribe_filters_by_company_id(self):
        """Subscriber only gets events for its company_id."""
        bus = EventBus.get()
        ev_c1 = {"type": "run.started", "company_id": "c1", "run_id": "r1", "payload": {}}
        ev_c2 = {"type": "run.started", "company_id": "c2", "run_id": "r2", "payload": {}}

        received = []

        async def consume():
            async for ev in bus.subscribe("c1"):
                received.append(ev)
                break

        task = asyncio.create_task(consume())
        await asyncio.sleep(0)
        await bus.publish(ev_c2)  # should be filtered out
        await bus.publish(ev_c1)  # should pass
        await asyncio.wait_for(task, timeout=1.0)

        assert len(received) == 1
        assert received[0]["company_id"] == "c1"

    @pytest.mark.asyncio
    async def test_multiple_subscribers(self):
        """Multiple subscribers each get a copy of the event."""
        bus = EventBus.get()
        event = {"type": "run.done", "company_id": "c1", "run_id": "r1", "payload": {}}

        received_a = []
        received_b = []

        async def consume_a():
            async for ev in bus.subscribe("c1"):
                received_a.append(ev)
                break

        async def consume_b():
            async for ev in bus.subscribe("c1"):
                received_b.append(ev)
                break

        ta = asyncio.create_task(consume_a())
        tb = asyncio.create_task(consume_b())
        await asyncio.sleep(0)
        await bus.publish(event)
        await asyncio.wait_for(asyncio.gather(ta, tb), timeout=1.0)

        assert len(received_a) == 1
        assert len(received_b) == 1

    @pytest.mark.asyncio
    async def test_subscribe_cleanup_on_cancel(self):
        """Cancelled subscriber is removed from internal list — no leak."""
        bus = EventBus.get()

        async def consume():
            async for _ in bus.subscribe("c1"):
                pass

        task = asyncio.create_task(consume())
        await asyncio.sleep(0)
        assert len(bus._subscribers) == 1

        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

        # subscriber queue removed
        assert len(bus._subscribers) == 0

    @pytest.mark.asyncio
    async def test_publish_is_non_blocking(self):
        """publish() does not block even without subscribers."""
        bus = EventBus.get()
        event = {"type": "run.started", "company_id": "c1", "run_id": "r1", "payload": {}}
        # Should not raise or block
        await bus.publish(event)

    def test_subscribers_is_instance_attribute_not_class_level(self):
        """ALEX-TD-023: _subscribers must be an instance attribute, not class-level.
        Two separate EventBus instances must not share the same list."""
        bus1 = EventBus.get()
        # Reset singleton to get a fresh instance
        EventBus._instance = None
        bus2 = EventBus.get()
        # Each instance must have its own list
        assert bus1._subscribers is not bus2._subscribers

    @pytest.mark.asyncio
    async def test_multiple_events_in_order(self):
        """Events are received in publication order."""
        bus = EventBus.get()
        events = [
            {"type": "run.started", "company_id": "c1", "run_id": "r1", "payload": {}},
            {"type": "run.progress", "company_id": "c1", "run_id": "r1", "payload": {"step": 1}},
            {"type": "run.done", "company_id": "c1", "run_id": "r1", "payload": {}},
        ]

        received = []

        async def consume():
            async for ev in bus.subscribe("c1"):
                received.append(ev)
                if len(received) == 3:
                    break

        task = asyncio.create_task(consume())
        await asyncio.sleep(0)
        for e in events:
            await bus.publish(e)
        await asyncio.wait_for(task, timeout=1.0)

        assert [e["type"] for e in received] == ["run.started", "run.progress", "run.done"]


# ── WebSocket integration tests ─────────────────────────────────────────────


def _register_and_login(client):
    """Helper: register user, login, return token."""
    client.post("/auth/register", json={
        "email": "ws@test.com", "password": "Secret123!", "name": "WS Test"
    })
    resp = client.post("/auth/login", json={
        "email": "ws@test.com", "password": "Secret123!"
    })
    return resp.json()["access_token"]


def _create_company(client, token):
    """Helper: create company, return id."""
    resp = client.post(
        "/api/companies/",
        json={"name": "WS Co"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, f"Company creation failed: {resp.status_code} {resp.text}"
    return resp.json()["id"]


class TestWebSocketIntegration:
    """WebSocket endpoint tests."""

    def test_ws_requires_auth(self, auth_client):
        """WebSocket without token: handshake accepted then closed with 4001 (Unauthorized).

        ALEX-TD-055: server always accept()s before close() for proxy compatibility.
        Close code 4001 = Unauthorized (was 1008 before TD-055 fix).
        """
        from starlette.websockets import WebSocketDisconnect
        client, _ = auth_client
        try:
            with client.websocket_connect(f"/ws/companies/{uuid.uuid4()}/events") as ws:
                try:
                    ws.receive_text()
                except WebSocketDisconnect as e:
                    assert e.code == 4001, f"Expected 4001 (Unauthorized), got {e.code}"
                    return
        except WebSocketDisconnect as e:
            assert e.code == 4001, f"Expected 4001 (Unauthorized), got {e.code}"

    def test_ws_connects_with_valid_token(self, auth_client):
        """WebSocket connects successfully with valid token in query param."""
        client, _ = auth_client
        token = _register_and_login(client)
        company_id = _create_company(client, token)

        with client.websocket_connect(
            f"/ws/companies/{company_id}/events?token={token}"
        ) as ws:
            # Connection established — just close cleanly
            pass

    def test_ws_receives_published_event(self, auth_client):
        """WebSocket client receives event published to EventBus."""
        client, _ = auth_client
        token = _register_and_login(client)
        company_id = _create_company(client, token)

        bus = EventBus.get()

        with client.websocket_connect(
            f"/ws/companies/{company_id}/events?token={token}"
        ) as ws:
            # Publish event from another "thread"
            import threading
            import json

            def publish():
                import asyncio as _aio
                loop = _aio.new_event_loop()
                loop.run_until_complete(bus.publish({
                    "type": "run.started",
                    "company_id": company_id,
                    "run_id": "r-123",
                    "payload": {},
                }))
                loop.close()

            t = threading.Thread(target=publish)
            t.start()
            t.join(timeout=2.0)

            data = ws.receive_json(mode="text")
            assert data["type"] == "run.started"
            assert data["run_id"] == "r-123"
            assert data["company_id"] == company_id


# ─── ALEX-TD-218: RedisEventBus.publish() должен обрабатывать ошибки Redis ──────

class TestRedisEventBusPublishErrorHandling:
    """ALEX-TD-218: ConnectionError/TimeoutError в publish() не должны ломать основной flow."""

    @pytest.mark.asyncio
    async def test_publish_connection_error_does_not_raise(self):
        """
        Если Redis недоступен (ConnectionError), publish() должен поглотить ошибку
        и залогировать warning — не пробрасывать исключение вызывающему.
        """
        from agentco.core.event_bus import RedisEventBus

        bus = RedisEventBus("redis://localhost:6379")

        mock_client = AsyncMock()
        mock_client.publish.side_effect = ConnectionError("Redis connection refused")

        with patch.object(bus, "_get_client", return_value=mock_client):
            # Не должно бросать исключение
            await bus.publish({"type": "llm_token", "company_id": "c1", "data": "x"})

    @pytest.mark.asyncio
    async def test_publish_timeout_error_does_not_raise(self):
        """
        Если Redis timeout (TimeoutError), publish() должен поглотить ошибку.
        """
        from agentco.core.event_bus import RedisEventBus

        bus = RedisEventBus("redis://localhost:6379")

        mock_client = AsyncMock()
        mock_client.publish.side_effect = TimeoutError("Redis timeout")

        with patch.object(bus, "_get_client", return_value=mock_client):
            await bus.publish({"type": "completion", "company_id": "c2", "data": "done"})

    @pytest.mark.asyncio
    async def test_publish_logs_warning_on_error(self):
        """
        При ошибке Redis, publish() должен логировать warning с деталями.
        """
        from agentco.core.event_bus import RedisEventBus
        import logging

        bus = RedisEventBus("redis://localhost:6379")

        mock_client = AsyncMock()
        mock_client.publish.side_effect = ConnectionError("Connection refused")

        with patch.object(bus, "_get_client", return_value=mock_client):
            with patch("agentco.core.event_bus.logger") as mock_logger:
                await bus.publish({"type": "llm_token", "company_id": "c3", "data": "y"})
                mock_logger.warning.assert_called_once()
                warning_args = mock_logger.warning.call_args[0]
                assert "c3" in str(warning_args) or "llm_token" in str(warning_args)
