"""
M3-001: Persistent Memory Service (RAG via sqlite-vec).

Stores agent memories as embeddings in sqlite-vec virtual table.
Provides semantic search to inject relevant context into agent prompts.

Architecture:
- agent_memory_meta: stores content, agent_id, task_id, created_at
- agent_memories_vec (vec0 virtual table): stores float32 embeddings (1536-dim)
- Rows joined by rowid == meta.rowid (1:1 mapping)

Usage:
    conn = sqlite3.connect("agentco.db")
    sqlite_vec.load(conn)
    svc = MemoryService(conn)
    svc.init_schema()

    # After task completion:
    svc.store(agent_id, task_id, content, embedding)

    # Before task start:
    memories = svc.search(agent_id, query_embedding, top_k=5)
    system_prompt += format_memories(memories)
"""
import sqlite3
import struct
from datetime import datetime, timezone
from typing import Any


# Embedding dimension (OpenAI text-embedding-3-small uses 1536)
EMBEDDING_DIM = 1536


def _pack_float32(vector: list[float]) -> bytes:
    """Pack a list of floats into bytes (little-endian float32)."""
    return struct.pack(f"{len(vector)}f", *vector)


class MemoryService:
    """Service for storing and retrieving agent memories via sqlite-vec."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def init_schema(self) -> None:
        """Create memory tables if they don't exist."""
        cursor = self._conn.cursor()

        # Metadata table (regular SQLite table)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS agent_memory_meta (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                task_id TEXT,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        # Vector table (sqlite-vec virtual table)
        # rowid matches agent_memory_meta.id
        cursor.execute(f"""
            CREATE VIRTUAL TABLE IF NOT EXISTS agent_memories_vec
            USING vec0(embedding float[{EMBEDDING_DIM}])
        """)

        self._conn.commit()

    def store(
        self,
        agent_id: str,
        task_id: str | None,
        content: str,
        embedding: list[float],
    ) -> int:
        """Store a memory and its embedding. Returns the rowid."""
        if len(embedding) != EMBEDDING_DIM:
            raise ValueError(f"Embedding must be {EMBEDDING_DIM}-dimensional, got {len(embedding)}")

        cursor = self._conn.cursor()
        now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

        # Insert metadata first to get rowid
        cursor.execute(
            "INSERT INTO agent_memory_meta (agent_id, task_id, content, created_at) VALUES (?, ?, ?, ?)",
            (agent_id, task_id, content, now),
        )
        rowid = cursor.lastrowid

        # Insert embedding with matching rowid
        packed = _pack_float32(embedding)
        cursor.execute(
            "INSERT INTO agent_memories_vec (rowid, embedding) VALUES (?, ?)",
            (rowid, packed),
        )

        self._conn.commit()
        return rowid

    def search(
        self,
        agent_id: str,
        query_embedding: list[float],
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """
        Find top-k most similar memories for agent_id.

        Returns list of dicts with keys: content, agent_id, task_id, created_at, distance.
        """
        if len(query_embedding) != EMBEDDING_DIM:
            raise ValueError(f"Query embedding must be {EMBEDDING_DIM}-dimensional")

        packed = _pack_float32(query_embedding)
        cursor = self._conn.cursor()

        # KNN search via sqlite-vec, filtered by agent_id
        cursor.execute(
            """
            SELECT m.id, m.agent_id, m.task_id, m.content, m.created_at, v.distance
            FROM agent_memories_vec v
            JOIN agent_memory_meta m ON v.rowid = m.id
            WHERE m.agent_id = ?
              AND v.embedding MATCH ?
              AND k = ?
            ORDER BY v.distance
            """,
            (agent_id, packed, top_k),
        )

        rows = cursor.fetchall()
        return [
            {
                "id": row[0],
                "agent_id": row[1],
                "task_id": row[2],
                "content": row[3],
                "created_at": row[4],
                "distance": row[5],
            }
            for row in rows
        ]

    def list_all(self, agent_id: str) -> list[dict[str, Any]]:
        """Return all memories for an agent (for API listing, no similarity ranking)."""
        cursor = self._conn.cursor()
        cursor.execute(
            "SELECT id, agent_id, task_id, content, created_at FROM agent_memory_meta WHERE agent_id = ? ORDER BY created_at DESC",
            (agent_id,),
        )
        rows = cursor.fetchall()
        return [
            {
                "id": row[0],
                "agent_id": row[1],
                "task_id": row[2],
                "content": row[3],
                "created_at": row[4],
            }
            for row in rows
        ]

    def delete_agent_memories(self, agent_id: str) -> int:
        """Delete all memories for an agent. Returns count deleted."""
        cursor = self._conn.cursor()
        cursor.execute(
            "SELECT id FROM agent_memory_meta WHERE agent_id = ?",
            (agent_id,),
        )
        ids = [row[0] for row in cursor.fetchall()]

        for rowid in ids:
            cursor.execute("DELETE FROM agent_memories_vec WHERE rowid = ?", (rowid,))

        cursor.execute(
            "DELETE FROM agent_memory_meta WHERE agent_id = ?",
            (agent_id,),
        )
        self._conn.commit()
        return len(ids)


def format_memories(memories: list[dict[str, Any]]) -> str:
    """
    Format memories for injection into system prompt.

    Returns empty string if no memories.
    Returns formatted block if memories present.
    """
    if not memories:
        return ""

    lines = ["## Relevant memories from past tasks:"]
    for i, mem in enumerate(memories, 1):
        lines.append(f"{i}. {mem['content']}")

    return "\n".join(lines)
