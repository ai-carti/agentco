"""
memory/service.py — async сервис для управления памятью агентов.

Отвечает за:
- save_memory(): получить embedding через LiteLLM → сохранить в MemoryStore
- get_relevant_memories(): запросить embedding для query → найти top-k
- inject_memories(): обогатить system prompt воспоминаниями
- format_memories(): отформатировать список воспоминаний для промпта
"""
from __future__ import annotations

import os
from typing import Any

import litellm

from agentco.memory.store import MemoryStore

_EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
# Use AGENTCO_MEMORY_DB if set, else fall back to AGENTCO_DB_PATH, else default
_DEFAULT_DB = os.environ.get("AGENTCO_MEMORY_DB") or os.environ.get("AGENTCO_DB_PATH", "./agentco_memory.db")


class MemoryService:
    """
    Async сервис памяти агентов.

    Использует LiteLLM для получения embeddings и MemoryStore для хранения.
    """

    def __init__(self, db_path: str = _DEFAULT_DB) -> None:
        self._store = MemoryStore(db_path)

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
        return self._store.insert(
            agent_id=agent_id,
            task_id=task_id,
            content=content,
            embedding=embedding,
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
        return self._store.search(
            agent_id=agent_id,
            query_embedding=query_embedding,
            top_k=top_k,
        )

    def get_all(self, agent_id: str) -> list[dict[str, Any]]:
        """Синхронно получить все воспоминания агента."""
        return self._store.get_all(agent_id)

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
