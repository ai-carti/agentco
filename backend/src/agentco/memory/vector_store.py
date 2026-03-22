"""
memory/vector_store.py — Abstract VectorStore + concrete implementations.

ALEX-POST-011: Abstraction layer for vector storage backends.

Implementations:
  - SqliteVecStore: current sqlite-vec based store (default for SQLite URLs)
  - PgVectorStore:  pgvector-based store for PostgreSQL deployments

Factory:
  - get_vector_store(database_url, **kwargs) → VectorStore
    Selects implementation based on DATABASE_URL:
      sqlite://  → SqliteVecStore
      postgresql:// / postgres:// → PgVectorStore

Install optional extras:
  pgvector backend: pip install "agentco[postgres-vector]"
"""
from __future__ import annotations

import sqlite3
import struct
import threading
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any

import sqlite_vec


# ---------------------------------------------------------------------------
# Abstract base class
# ---------------------------------------------------------------------------

class VectorStore(ABC):
    """Abstract vector store interface."""

    EMBEDDING_DIM: int = 1536

    @abstractmethod
    def insert(
        self,
        agent_id: str,
        task_id: str | None,
        content: str,
        embedding: list[float],
    ) -> str:
        """Insert a memory. Returns memory id (str)."""
        ...

    @abstractmethod
    def search(
        self,
        agent_id: str,
        query_embedding: list[float],
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """Search for top_k nearest memories for the given agent."""
        ...

    @abstractmethod
    def delete_by_agent(self, agent_id: str) -> None:
        """Delete all memories for a given agent."""
        ...

    @abstractmethod
    def close(self) -> None:
        """Release any underlying resources."""
        ...


# ---------------------------------------------------------------------------
# SqliteVecStore — sqlite-vec implementation (existing, moved from store.py)
# ---------------------------------------------------------------------------

class SqliteVecStore(VectorStore):
    """
    sqlite-vec хранилище векторной памяти.

    Схема:
      agent_memory_meta(id TEXT, agent_id TEXT, task_id TEXT, content TEXT, created_at TEXT)
      agent_memories_vec (vec0 virtual table, embedding float[1536])
    """

    def __init__(self, db_path: str = ":memory:") -> None:
        self._db_path = db_path
        # ALEX-TD-080: explicit lock for thread safety.
        # check_same_thread=False disables SQLite's own check, but does NOT provide
        # thread safety. Concurrent run_in_executor calls from multiple asyncio tasks
        # can hit OperationalError: database is locked without this lock.
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._setup()

    def _setup(self) -> None:
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
        memory_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        packed = self._pack(embedding)

        # ALEX-TD-080: acquire lock before any DB operation
        with self._lock:
            cursor = self._conn.execute(
                "INSERT INTO agent_memories_vec(embedding) VALUES (?)",
                [packed],
            )
            vec_rowid = cursor.lastrowid

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
        packed = self._pack(query_embedding)
        candidate_limit = top_k * 5

        # ALEX-TD-080: acquire lock for read (sqlite3 is not safe for concurrent reads
        # when writes are in progress via the same connection object)
        with self._lock:
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

    def delete_by_agent(self, agent_id: str) -> None:
        """Delete all memories for agent_id from both meta and vec tables."""
        # ALEX-TD-080: acquire lock
        with self._lock:
            # ALEX-TD-090: batch DELETE using IN clause instead of N individual DELETEs.
            # Old O(N) pattern looped over each rowid separately — O(1) IN clause replaces it.
            rows = self._conn.execute(
                "SELECT rowid_id FROM agent_memory_meta WHERE agent_id = ?",
                [agent_id],
            ).fetchall()

            rowid_ids = [row[0] for row in rows]

            if rowid_ids:
                # Build IN clause: DELETE ... WHERE rowid IN (?, ?, ...)
                placeholders = ",".join("?" * len(rowid_ids))
                self._conn.execute(
                    f"DELETE FROM agent_memories_vec WHERE rowid IN ({placeholders})",
                    rowid_ids,
                )

            # Delete from meta table (single DELETE regardless of count)
            self._conn.execute(
                "DELETE FROM agent_memory_meta WHERE agent_id = ?",
                [agent_id],
            )
            self._conn.commit()

    def get_all(self, agent_id: str, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        """Get all memories for agent with pagination."""
        # ALEX-TD-080: acquire lock
        with self._lock:
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
        with self._lock:
            self._conn.close()

    @staticmethod
    def _pack(embedding: list[float]) -> bytes:
        return struct.pack(f"{len(embedding)}f", *embedding)


# ---------------------------------------------------------------------------
# PgVectorStore — pgvector implementation for PostgreSQL
# ---------------------------------------------------------------------------

class PgVectorStore(VectorStore):
    """
    pgvector-based vector store for PostgreSQL.

    Requires: pgvector Python package + pgvector extension in Postgres.
    Install: pip install "agentco[postgres-vector]"

    Schema:
      agent_memory_meta (id, agent_id, task_id, content, embedding vector(1536), created_at)

    The pgvector extension must be enabled: CREATE EXTENSION IF NOT EXISTS vector;
    This is done automatically on first connection.
    """

    def __init__(self, database_url: str) -> None:
        try:
            import psycopg2
            from pgvector.psycopg2 import register_vector
        except ImportError as e:
            raise ImportError(
                "PgVectorStore requires psycopg2 and pgvector. "
                "Install with: pip install \"agentco[postgres,postgres-vector]\""
            ) from e

        # ALEX-TD-088: threading.Lock for psycopg2 connection safety.
        # psycopg2 connections are NOT thread-safe (PEP 249 says each thread should
        # use its own connection, but our async run_in_executor callers share this instance).
        # Mirrors SqliteVecStore._lock pattern to prevent concurrent-access errors.
        self._lock = threading.Lock()
        self._conn = psycopg2.connect(database_url)
        register_vector(self._conn)
        self._setup()

    def _setup(self) -> None:
        """Enable pgvector extension and create tables if not exist."""
        with self._conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS agent_memory_meta (
                    id         TEXT PRIMARY KEY,
                    agent_id   TEXT NOT NULL,
                    task_id    TEXT,
                    content    TEXT NOT NULL,
                    embedding  vector({self.EMBEDDING_DIM}),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS agent_memory_hnsw_idx "
                "ON agent_memory_meta USING hnsw (embedding vector_cosine_ops);"
            )
        self._conn.commit()

    def insert(
        self,
        agent_id: str,
        task_id: str | None,
        content: str,
        embedding: list[float],
    ) -> str:
        import numpy as np

        memory_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        vec = np.array(embedding)

        # ALEX-TD-088: acquire lock before DB operation
        with self._lock:
            with self._conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO agent_memory_meta(id, agent_id, task_id, content, embedding, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    [memory_id, agent_id, task_id, content, vec, created_at],
                )
            self._conn.commit()
        return memory_id

    def search(
        self,
        agent_id: str,
        query_embedding: list[float],
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        import numpy as np

        vec = np.array(query_embedding)
        # ALEX-TD-088: acquire lock before DB operation
        with self._lock:
            with self._conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, agent_id, task_id, content, created_at,
                           embedding <=> %s AS distance
                    FROM agent_memory_meta
                    WHERE agent_id = %s
                    ORDER BY embedding <=> %s
                    LIMIT %s
                    """,
                    [vec, agent_id, vec, top_k],
                )
                rows = cur.fetchall()
                cols = [desc[0] for desc in cur.description]

        return [dict(zip(cols, row)) for row in rows]

    def delete_by_agent(self, agent_id: str) -> None:
        # ALEX-TD-088: acquire lock before DB operation
        with self._lock:
            with self._conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM agent_memory_meta WHERE agent_id = %s",
                    [agent_id],
                )
            self._conn.commit()

    def get_all(self, agent_id: str, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        # ALEX-TD-088: acquire lock before DB operation
        with self._lock:
            with self._conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, agent_id, task_id, content, created_at
                    FROM agent_memory_meta
                    WHERE agent_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    [agent_id, limit, offset],
                )
                rows = cur.fetchall()
                cols = [desc[0] for desc in cur.description]
        return [dict(zip(cols, row)) for row in rows]

    def close(self) -> None:
        with self._lock:
            self._conn.close()


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_vector_store(
    database_url: str,
    db_path: str = "./agentco_memory.db",
    **kwargs: Any,
) -> VectorStore:
    """
    Factory: returns the appropriate VectorStore based on DATABASE_URL.

    sqlite:// → SqliteVecStore (default)
    postgresql:// or postgres:// → PgVectorStore

    Args:
        database_url: DB connection URL (determines backend)
        db_path: file path for SQLite stores (ignored for Postgres)
        **kwargs: passed to the concrete store constructor
    """
    if database_url.startswith("postgresql://") or database_url.startswith("postgres://"):
        return PgVectorStore(database_url, **kwargs)
    return SqliteVecStore(db_path=db_path, **kwargs)
