"""
memory/service.py — async сервис для управления памятью агентов.

Отвечает за:
- save_memory(): получить embedding через LiteLLM → сохранить в MemoryStore
- get_relevant_memories(): запросить embedding для query → найти top-k
- inject_memories(): обогатить system prompt воспоминаниями
- format_memories(): отформатировать список воспоминаний для промпта
"""
from __future__ import annotations

import asyncio
import os
from typing import Any

import litellm

from agentco.memory.vector_store import VectorStore, SqliteVecStore

_EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
# Use AGENTCO_MEMORY_DB if set, else fall back to AGENTCO_DB_PATH, else default
_DEFAULT_DB = os.environ.get("AGENTCO_MEMORY_DB") or os.environ.get("AGENTCO_DB_PATH", "./agentco_memory.db")


class MemoryService:
    """
    Async сервис памяти агентов.

    Использует LiteLLM для получения embeddings и VectorStore для хранения.

    ALEX-TD-077: принимает VectorStore-совместимый объект в конструкторе.
    Для обратной совместимости строка db_path по-прежнему создаёт SqliteVecStore.
    """

    def __init__(self, store_or_db_path: "VectorStore | str" = _DEFAULT_DB) -> None:
        if isinstance(store_or_db_path, str):
            # backward-compat: db_path string → create SqliteVecStore
            self._store: VectorStore = SqliteVecStore(db_path=store_or_db_path)
        else:
            # ALEX-TD-077: accept any VectorStore-compatible object
            self._store = store_or_db_path

    def close(self) -> None:
        self._store.close()

    async def save_memory(
        self,
        agent_id: str,
        task_id: str | None,
        content: str,
    ) -> str:
        """
        Сохранить воспоминание агента из результата задачи.

        Получает embedding через LiteLLM, сохраняет в sqlite-vec.
        Returns: id воспоминания
        """
        embedding = await self._get_embedding(content)
        # ALEX-TD-021 fix: run blocking sqlite insert in thread executor
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            self._store.insert,
            agent_id,
            task_id,
            content,
            embedding,
        )

    async def get_relevant_memories(
        self,
        agent_id: str,
        query: str,
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """
        Найти top-k релевантных воспоминаний для данного запроса.

        Получает embedding запроса через LiteLLM, ищет в MemoryStore.
        """
        query_embedding = await self._get_embedding(query)
        # ALEX-TD-021 fix: run blocking sqlite search in thread executor
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            self._store.search,
            agent_id,
            query_embedding,
            top_k,
        )

    def get_all(self, agent_id: str, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        """Синхронно получить воспоминания агента с пагинацией (ALEX-TD-044)."""
        return self._store.get_all(agent_id, limit=limit, offset=offset)

    async def inject_memories(
        self,
        agent_id: str,
        base_prompt: str,
        task_description: str,
        top_k: int = 5,
    ) -> str:
        """
        Обогатить system prompt релевантными воспоминаниями.

        Если воспоминаний нет — возвращает base_prompt без изменений.
        """
        memories = await self.get_relevant_memories(
            agent_id=agent_id,
            query=task_description,
            top_k=top_k,
        )
        if not memories:
            return base_prompt

        memory_section = self.format_memories(memories)
        return f"{base_prompt}\n\n{memory_section}"

    def format_memories(self, memories: list[dict[str, Any]]) -> str:
        """
        Форматировать список воспоминаний для вставки в system prompt.

        Возвращает markdown-секцию с past experiences.
        """
        if not memories:
            return ""

        lines = ["## Past experiences (memories)"]
        for i, m in enumerate(memories, 1):
            date = m.get("created_at", "")[:10] if m.get("created_at") else ""
            date_str = f" ({date})" if date else ""
            lines.append(f"{i}. {m['content']}{date_str}")

        return "\n".join(lines)

    async def _get_embedding(self, text: str) -> list[float]:
        """Получить embedding через LiteLLM."""
        response = await litellm.aembedding(
            model=_EMBEDDING_MODEL,
            input=text,
        )
        return response.data[0].embedding
