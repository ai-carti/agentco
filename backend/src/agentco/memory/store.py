"""
memory/store.py — aliased to SqliteVecStore for backward compatibility.

ALEX-TD-078: MemoryStore и SqliteVecStore реализовывали идентичную логику.
Dead code устранён: MemoryStore теперь алиас SqliteVecStore.
Все импорты `from agentco.memory.store import MemoryStore` продолжат работать.
"""
from __future__ import annotations

from agentco.memory.vector_store import SqliteVecStore

# ALEX-TD-078: alias — no duplicate implementation
MemoryStore = SqliteVecStore

__all__ = ["MemoryStore"]
