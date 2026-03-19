"""
In-process EventBus — asyncio.Queue fan-out (M2-005).

Singleton with publish/subscribe. Each subscriber gets its own Queue.
Filtering by company_id happens inside subscribe().
"""
import asyncio
import logging
from typing import AsyncIterator

logger = logging.getLogger(__name__)

# ALEX-TD-034: bounded queue size to prevent OOM when client is slow or disconnected
_QUEUE_MAXSIZE = 1000


class EventBus:
    _instance: "EventBus | None" = None

    def __init__(self) -> None:
        raise RuntimeError("Use EventBus.get()")

    def _init_instance(self) -> None:
        """Initialize instance attributes (called from get() on new instance)."""
        # List of (company_id, asyncio.Queue) tuples — per-instance, not class-level
        self._subscribers: list[tuple[str, asyncio.Queue]] = []

    @classmethod
    def get(cls) -> "EventBus":
        if cls._instance is None:
            instance = object.__new__(cls)
            instance._init_instance()
            cls._instance = instance
        return cls._instance

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
