"""agentco.memory — Persistent agent memory via sqlite-vec (RAG)."""
from .store import MemoryStore  # ALEX-TD-078: aliased to SqliteVecStore
from .service import MemoryService

__all__ = ["MemoryStore", "MemoryService"]
