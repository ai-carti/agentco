"""
agentco/eventbus.py — простой asyncio.Queue singleton EventBus (M2-003).

Singleton с publish/subscribe. Каждый подписчик получает свою Queue.
Фильтрация по company_id происходит в subscribe().

Пример:
    bus = EventBus.get()
    await bus.publish({"company_id": "c1", "type": "token", "data": "Hello"})

    async for event in bus.subscribe("c1"):
        print(event)
"""
from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator

logger = logging.getLogger(__name__)


class EventBus:
    """
    Singleton EventBus на основе asyncio.Queue.

    Поддерживает fan-out: несколько подписчиков могут слушать одну company.
    """
    _instance: "EventBus | None" = None
    _subscribers: list[tuple[str, asyncio.Queue]]

    def __init__(self) -> None:
        raise RuntimeError("Use EventBus.get()")

    @classmethod
    def get(cls) -> "EventBus":
        """Получить singleton инстанс EventBus."""
        if cls._instance is None:
            instance = object.__new__(cls)
            instance._subscribers = []
            cls._instance = instance
        return cls._instance

    async def publish(self, event: dict) -> None:
        """
        Неблокирующая публикация события всем подписчикам с matching company_id.

        Args:
            event: словарь с обязательным полем company_id
        """
        company = event.get("company_id")
        for sub_company_id, queue in self._subscribers:
            if company == sub_company_id:
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    logger.warning("EventBus queue full for company %s, dropping event", company)

    async def subscribe(self, company_id: str) -> AsyncIterator[dict]:
        """
        Async generator: возвращает события для company_id.

        Автоматически очищает подписку при выходе (CancelledError или break).

        Args:
            company_id: ID компании для фильтрации событий
        """
        queue: asyncio.Queue = asyncio.Queue(maxsize=1000)
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
