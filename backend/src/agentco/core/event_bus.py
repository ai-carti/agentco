"""
EventBus — asyncio.Queue fan-out (M2-005) with optional Redis pub/sub (ALEX-POST-002).

Two implementations:
- InProcessEventBus: original asyncio.Queue fan-out (default, backward compatible)
- RedisEventBus: Redis pub/sub for multi-worker deployments (requires REDIS_URL env)

Factory:
    EventBus.get() → InProcessEventBus (no REDIS_URL)
                   → RedisEventBus    (REDIS_URL is set)
"""
import asyncio
import json
import logging
import os
from typing import AsyncIterator

logger = logging.getLogger(__name__)

# ALEX-TD-034: bounded queue size to prevent OOM when client is slow or disconnected
_QUEUE_MAXSIZE = 1000

REDIS_CHANNEL_PREFIX = "agentco:events:"


# ── InProcessEventBus ─────────────────────────────────────────────────────────

class InProcessEventBus:
    """In-process asyncio.Queue fan-out. Single worker only."""

    def __init__(self) -> None:
        self._subscribers: list[tuple[str, asyncio.Queue]] = []

    async def publish(self, event: dict) -> None:
        """Non-blocking put to all subscriber queues.

        ALEX-TD-034: uses bounded queue (maxsize=_QUEUE_MAXSIZE).
        If queue is full, the event is dropped and a warning is logged to prevent OOM.
        """
        for _company_id, queue in self._subscribers:
            company = event.get("company_id")
            if company == _company_id:
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    logger.warning(
                        "EventBus: queue full for company %s (maxsize=%d) — event dropped: %s",
                        _company_id,
                        _QUEUE_MAXSIZE,
                        event.get("type"),
                    )

    async def subscribe(self, company_id: str) -> AsyncIterator[dict]:
        """Async generator yielding events for company_id. Cleans up on exit."""
        # ALEX-TD-034: bounded queue — prevents OOM when client is slow/disconnected
        queue: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
        entry = (company_id, queue)
        self._subscribers.append(entry)
        try:
            while True:
                event = await queue.get()
                yield event
        except asyncio.CancelledError:
            raise
        finally:
            try:
                self._subscribers.remove(entry)
            except ValueError:
                pass


# ── RedisEventBus ─────────────────────────────────────────────────────────────

class RedisEventBus:
    """Redis pub/sub EventBus for horizontal scaling (multi-worker).

    Requires redis-py 4+: pip install "agentco[redis]"
    Activated when REDIS_URL env var is set.

    Each subscriber opens its own pubsub connection and listens on a per-company channel.
    publish() sends events to all workers via Redis, ensuring cross-worker delivery.
    """

    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._client = None  # lazy-init

    async def _get_client(self):
        """Lazy-initialize Redis client."""
        if self._client is None:
            import redis.asyncio as aioredis  # optional dep
            self._client = aioredis.from_url(self._redis_url, decode_responses=True)
        return self._client

    async def publish(self, event: dict) -> None:
        """Publish event to Redis channel for the event's company_id."""
        company_id = event.get("company_id", "")
        channel = f"{REDIS_CHANNEL_PREFIX}{company_id}"
        client = await self._get_client()
        await client.publish(channel, json.dumps(event))

    async def subscribe(self, company_id: str) -> AsyncIterator[dict]:
        """Async generator yielding events for company_id from Redis pub/sub."""
        client = await self._get_client()
        channel = f"{REDIS_CHANNEL_PREFIX}{company_id}"
        pubsub = client.pubsub()
        await pubsub.subscribe(channel)
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        yield json.loads(message["data"])
                    except (json.JSONDecodeError, TypeError) as e:
                        logger.warning("RedisEventBus: invalid JSON in message: %s", e)
        except asyncio.CancelledError:
            raise
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
            except Exception as e:
                logger.debug("RedisEventBus: cleanup error: %s", e)


# ── EventBus facade (backward compatible) ────────────────────────────────────

class EventBus:
    """
    Backward-compatible facade.

    Usage (unchanged from original):
        bus = EventBus.get()
        await bus.publish(event)
        async for e in bus.subscribe(company_id): ...

    Routing:
        REDIS_URL set   → RedisEventBus
        REDIS_URL unset → InProcessEventBus
    """

    _instance: "InProcessEventBus | RedisEventBus | None" = None

    def __init__(self) -> None:
        raise RuntimeError("Use EventBus.get()")

    @classmethod
    def get(cls) -> "InProcessEventBus | RedisEventBus":
        if cls._instance is None:
            redis_url = os.getenv("REDIS_URL")
            if redis_url:
                try:
                    import redis.asyncio  # noqa: F401 — check availability
                    cls._instance = RedisEventBus(redis_url)
                    logger.info("EventBus: using Redis at %s", redis_url)
                except ImportError:
                    logger.warning(
                        "REDIS_URL is set but redis-py[asyncio] is not installed. "
                        "Falling back to InProcessEventBus. "
                        "Install with: pip install 'agentco[redis]'"
                    )
                    cls._instance = InProcessEventBus()
            else:
                cls._instance = InProcessEventBus()
        return cls._instance
