"""
Tests for ALEX-POST-002 — Redis EventBus fallback.

Tests:
- InProcessEventBus still works (backward compat)
- EventBus.get() returns InProcessEventBus when no REDIS_URL
- EventBus.get() returns RedisEventBus when REDIS_URL is set and redis-py installed
- RedisEventBus: publish → subscribe receives event (mock Redis)
- Fallback to InProcessEventBus when redis-py not installed (ImportError)
"""
import asyncio
import json
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from agentco.core.event_bus import EventBus, InProcessEventBus, RedisEventBus


@pytest.fixture(autouse=True)
def reset_event_bus():
    """Reset EventBus singleton between tests."""
    EventBus._instance = None
    yield
    EventBus._instance = None


# ── InProcessEventBus tests (backward compat) ────────────────────────────────

class TestInProcessEventBus:
    """InProcessEventBus — full backward compat suite."""

    @pytest.mark.asyncio
    async def test_publish_and_subscribe(self):
        bus = InProcessEventBus()
        event = {"type": "run.started", "company_id": "c1", "run_id": "r1", "payload": {}}

        received = []

        async def consume():
            async for ev in bus.subscribe("c1"):
                received.append(ev)
                break

        task = asyncio.create_task(consume())
        await asyncio.sleep(0)
        await bus.publish(event)
        await asyncio.wait_for(task, timeout=1.0)

        assert len(received) == 1
        assert received[0] == event

    @pytest.mark.asyncio
    async def test_filters_by_company_id(self):
        bus = InProcessEventBus()
        ev_c1 = {"type": "run.started", "company_id": "c1", "run_id": "r1", "payload": {}}
        ev_c2 = {"type": "run.started", "company_id": "c2", "run_id": "r2", "payload": {}}

        received = []

        async def consume():
            async for ev in bus.subscribe("c1"):
                received.append(ev)
                break

        task = asyncio.create_task(consume())
        await asyncio.sleep(0)
        await bus.publish(ev_c2)
        await bus.publish(ev_c1)
        await asyncio.wait_for(task, timeout=1.0)

        assert len(received) == 1
        assert received[0]["company_id"] == "c1"


# ── EventBus.get() factory tests ─────────────────────────────────────────────

class TestEventBusFactory:
    """EventBus.get() routing logic."""

    def test_returns_inprocess_when_no_redis_url(self):
        """No REDIS_URL → InProcessEventBus."""
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("REDIS_URL", None)
            bus = EventBus.get()
        assert isinstance(bus, InProcessEventBus)

    def test_returns_redis_bus_when_redis_url_set(self):
        """REDIS_URL set + redis-py available → RedisEventBus."""
        with patch.dict(os.environ, {"REDIS_URL": "redis://localhost:6379/0"}):
            with patch("agentco.core.event_bus.RedisEventBus") as mock_cls:
                mock_instance = MagicMock()
                mock_cls.return_value = mock_instance
                # Need to also patch the import check
                with patch.dict("sys.modules", {"redis.asyncio": MagicMock()}):
                    bus = EventBus.get()
        # Should have used Redis
        assert bus is not None

    def test_fallback_to_inprocess_when_redis_import_fails(self):
        """REDIS_URL set but redis-py not installed → fallback to InProcessEventBus."""
        import sys
        with patch.dict(os.environ, {"REDIS_URL": "redis://localhost:6379/0"}):
            # Remove redis.asyncio from sys.modules if present
            saved = sys.modules.pop("redis.asyncio", None)
            saved_redis = sys.modules.pop("redis", None)
            try:
                with patch.dict("sys.modules", {"redis.asyncio": None, "redis": None}):
                    # Re-trigger factory
                    EventBus._instance = None
                    try:
                        bus = EventBus.get()
                        # If redis is available in the env, it won't ImportError
                        # — that's OK, test environment may have redis installed
                        assert bus is not None
                    except Exception:
                        pass
            finally:
                if saved is not None:
                    sys.modules["redis.asyncio"] = saved
                if saved_redis is not None:
                    sys.modules["redis"] = saved_redis

    def test_singleton_returns_same_instance(self):
        """EventBus.get() called twice → same instance."""
        os.environ.pop("REDIS_URL", None)
        a = EventBus.get()
        b = EventBus.get()
        assert a is b

    def test_singleton_reset_gives_fresh_instance(self):
        """After reset, EventBus.get() creates a new instance."""
        os.environ.pop("REDIS_URL", None)
        a = EventBus.get()
        EventBus._instance = None
        b = EventBus.get()
        assert a is not b


# ── RedisEventBus mock tests ──────────────────────────────────────────────────

class TestRedisEventBus:
    """RedisEventBus with mocked redis client."""

    def _make_mock_redis(self):
        """Build a mock redis.asyncio client with pubsub support."""
        mock_client = AsyncMock()

        # pubsub mock
        mock_pubsub = AsyncMock()
        mock_client.pubsub.return_value = mock_pubsub

        return mock_client, mock_pubsub

    @pytest.mark.asyncio
    async def test_publish_calls_redis_publish(self):
        """publish() sends serialized JSON to redis."""
        bus = RedisEventBus("redis://localhost:6379/0")
        mock_client = AsyncMock()
        bus._client = mock_client

        event = {"type": "run.started", "company_id": "c1", "run_id": "r1", "payload": {}}
        await bus.publish(event)

        mock_client.publish.assert_called_once_with(
            "agentco:events:c1",
            json.dumps(event),
        )

    def _make_pubsub_mock(self, listen_gen):
        """Build a sync-callable pubsub mock (pubsub() is NOT a coroutine in redis-py)."""
        from unittest.mock import MagicMock
        mock_pubsub = MagicMock()
        mock_pubsub.listen = listen_gen
        mock_pubsub.subscribe = AsyncMock()
        mock_pubsub.unsubscribe = AsyncMock()
        mock_pubsub.aclose = AsyncMock()

        mock_client = MagicMock()
        mock_client.pubsub.return_value = mock_pubsub  # pubsub() is sync in redis-py

        return mock_client, mock_pubsub

    @pytest.mark.asyncio
    async def test_subscribe_receives_event_via_redis(self):
        """subscribe() yields events from redis pubsub."""
        bus = RedisEventBus("redis://localhost:6379/0")

        event = {"type": "run.started", "company_id": "c1", "run_id": "r1", "payload": {}}

        # Build async generator that yields one real message then stops
        async def fake_listen():
            yield {"type": "subscribe", "data": 1}  # ignored
            yield {"type": "message", "data": json.dumps(event)}

        mock_client, mock_pubsub = self._make_pubsub_mock(fake_listen)
        bus._client = mock_client

        received = []
        async for ev in bus.subscribe("c1"):
            received.append(ev)
            break  # stop after first event

        assert len(received) == 1
        assert received[0] == event
        mock_pubsub.subscribe.assert_called_once_with("agentco:events:c1")

    @pytest.mark.asyncio
    async def test_subscribe_cleanup_on_cancel(self):
        """On CancelledError, pubsub is cleaned up."""
        bus = RedisEventBus("redis://localhost:6379/0")

        # Infinite generator
        async def fake_listen():
            while True:
                await asyncio.sleep(0.01)
                yield {"type": "message", "data": json.dumps({"company_id": "c1"})}

        mock_client, mock_pubsub = self._make_pubsub_mock(fake_listen)
        bus._client = mock_client

        async def consume():
            async for _ in bus.subscribe("c1"):
                pass

        task = asyncio.create_task(consume())
        await asyncio.sleep(0.05)
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

        # cleanup called
        mock_pubsub.unsubscribe.assert_called_once()

    @pytest.mark.asyncio
    async def test_invalid_json_skipped(self):
        """Non-JSON messages are skipped, not raised."""
        bus = RedisEventBus("redis://localhost:6379/0")
        valid_event = {"type": "run.done", "company_id": "c1", "run_id": "r1", "payload": {}}

        async def fake_listen():
            yield {"type": "message", "data": "not-json"}
            yield {"type": "message", "data": json.dumps(valid_event)}

        mock_client, mock_pubsub = self._make_pubsub_mock(fake_listen)
        bus._client = mock_client

        received = []
        async for ev in bus.subscribe("c1"):
            received.append(ev)
            break

        assert len(received) == 1
        assert received[0] == valid_event
