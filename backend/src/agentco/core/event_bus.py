"""
In-process EventBus — asyncio.Queue fan-out (M2-005).

Singleton with publish/subscribe. Each subscriber gets its own Queue.
Filtering by company_id happens inside subscribe().
"""
import asyncio
import logging
from typing import AsyncIterator

logger = logging.getLogger(__name__)


class EventBus:
    _instance: "EventBus | None" = None
    # List of (company_id, asyncio.Queue) tuples
    _subscribers: list[tuple[str, asyncio.Queue]] = []

    def __init__(self) -> None:
        raise RuntimeError("Use EventBus.get()")

    @classmethod
    def get(cls) -> "EventBus":
        if cls._instance is None:
            cls._instance = object.__new__(cls)
        return cls._instance

    async def publish(self, event: dict) -> None:
        """Non-blocking put to all subscriber queues."""
        for _company_id, queue in self._subscribers:
            company = event.get("company_id")
            if company == _company_id:
                queue.put_nowait(event)

    async def subscribe(self, company_id: str) -> AsyncIterator[dict]:
        """Async generator yielding events for company_id. Cleans up on exit."""
        queue: asyncio.Queue = asyncio.Queue()
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
