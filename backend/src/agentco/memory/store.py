"""
memory/store.py — sqlite-vec хранилище воспоминаний агентов.

Схема:
  agent_memory_meta(id TEXT, agent_id TEXT, task_id TEXT, content TEXT, created_at TEXT)
  agent_memories_vec (vec0 virtual table, embedding float[1536])

rowid в vec0 сопоставлен с ROWID meta таблицы через INTEGER id.
"""
from __future__ import annotations

import sqlite3
import struct
import uuid
from datetime import datetime, timezone
from typing import Any

import sqlite_vec


class MemoryStore:
    """
    Синхронное хранилище векторной памяти.

    Используется напрямую в MemoryService (который делает async обёртку).
    """

    EMBEDDING_DIM = 1536

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._setup()

    def _setup(self) -> None:
        """Включить sqlite-vec и создать таблицы если не существуют."""
        self._conn.enable_load_extension(True)
        sqlite_vec.load(self._conn)
        self._conn.enable_load_extension(False)

        self._conn.executescript(f"""
            CREATE TABLE IF NOT EXISTS agent_memory_meta (
                id       TEXT PRIMARY KEY,
                rowid_id INTEGER UNIQUE,
                agent_id TEXT NOT NULL,
                task_id  TEXT,
                content  TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS agent_memories_vec
            USING vec0(embedding float[{self.EMBEDDING_DIM}]);
        """)
        self._conn.commit()

    def insert(
        self,
        agent_id: str,
        task_id: str | None,
        content: str,
        embedding: list[float],
    ) -> str:
        """
        Вставить воспоминание в хранилище.

        Returns:
            id воспоминания (UUID)
        """
        memory_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        packed = self._pack(embedding)

        # Вставляем вектор, получаем rowid
        cursor = self._conn.execute(
            "INSERT INTO agent_memories_vec(embedding) VALUES (?)",
            [packed],
        )
        vec_rowid = cursor.lastrowid

        # Вставляем метаданные, связывая с vec rowid
        self._conn.execute(
            """
            INSERT INTO agent_memory_meta(id, rowid_id, agent_id, task_id, content, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [memory_id, vec_rowid, agent_id, task_id, content, created_at],
        )
        self._conn.commit()
        return memory_id

    def search(
        self,
        agent_id: str,
        query_embedding: list[float],
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """
        Найти top_k наиболее релевантных воспоминаний для данного агента.

        Использует vec0 KNN поиск + фильтрацию по agent_id.
        """
        packed = self._pack(query_embedding)

        # sqlite-vec не поддерживает JOIN в KNN запросах напрямую.
        # Стратегия: получить top_k*5 кандидатов из vec0, потом отфильтровать по agent_id.
        candidate_limit = top_k * 5

        rows = self._conn.execute(
            """
            SELECT m.id, m.agent_id, m.task_id, m.content, m.created_at, v.distance
            FROM agent_memories_vec v
            JOIN agent_memory_meta m ON m.rowid_id = v.rowid
            WHERE v.embedding MATCH ? AND v.k = ?
              AND m.agent_id = ?
            ORDER BY v.distance
            LIMIT ?
            """,
            [packed, candidate_limit, agent_id, top_k],
        ).fetchall()

        return [dict(row) for row in rows]

    def get_all(self, agent_id: str, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        """Получить воспоминания агента с пагинацией (ALEX-TD-044), сортировка: новые первыми."""
        rows = self._conn.execute(
            """
            SELECT id, agent_id, task_id, content, created_at
            FROM agent_memory_meta
            WHERE agent_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            [agent_id, limit, offset],
        ).fetchall()
        return [dict(row) for row in rows]

    def close(self) -> None:
        """Закрыть соединение с БД."""
        self._conn.close()

    @staticmethod
    def _pack(embedding: list[float]) -> bytes:
        """Упаковать список float в bytes для sqlite-vec."""
        return struct.pack(f"{len(embedding)}f", *embedding)
