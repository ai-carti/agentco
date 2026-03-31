"""
handlers/memory.py — GET /api/companies/{company_id}/agents/{agent_id}/memory

M3-001: Endpoint для получения списка воспоминаний агента.
"""
from __future__ import annotations

import logging
import os
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from agentco.auth.dependencies import get_current_user
from agentco.core.rate_limiting import limiter
from agentco.db.session import get_session
from agentco.memory.service import MemoryService
from agentco.orm.user import UserORM
from agentco.repositories.agent import AgentRepository
from agentco.repositories.base import NotFoundError
from agentco.repositories.company import CompanyRepository

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/companies/{company_id}/agents/{agent_id}/memory",
    tags=["memory"],
)

_MEMORY_DB = os.environ.get("AGENTCO_MEMORY_DB", "./agentco_memory.db")
# ALEX-TD-128: rate limit for memory endpoint — SQLite IO per request
_RATE_LIMIT_MEMORY = os.environ.get("RATE_LIMIT_MEMORY", "60/minute")

# ALEX-TD-298: module-level singleton SqliteVecStore to avoid creating a new
# sqlite3 connection + loading sqlite_vec extension on every request.
# At 60 RPS this saves 60 connection opens + extension loads per second.
_memory_store_singleton: "MemoryService | None" = None


def _get_memory_store(db_path: str | None = None) -> "MemoryService":
    """Return a singleton MemoryService backed by a shared SqliteVecStore.

    The store is created lazily on first call. Subsequent calls return the
    same instance regardless of db_path (singleton pattern — first caller wins).
    Use _reset_memory_store() in tests to clear the cached instance.
    """
    global _memory_store_singleton
    if _memory_store_singleton is None:
        from agentco.memory.vector_store import SqliteVecStore
        store = SqliteVecStore(db_path=db_path or _MEMORY_DB)
        _memory_store_singleton = MemoryService(store)
    return _memory_store_singleton


def _reset_memory_store() -> None:
    """Clear the singleton MemoryService. Used by tests and graceful shutdown."""
    global _memory_store_singleton
    if _memory_store_singleton is not None:
        try:
            _memory_store_singleton.close()
        except Exception:
            pass
    _memory_store_singleton = None


@router.get("", response_model=list[dict])
@limiter.limit(_RATE_LIMIT_MEMORY)
def get_agent_memory(
    request: Request,
    company_id: uuid.UUID,
    agent_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=100),  # ALEX-TD-259: le=100 consistent with ALEX-TD-238 policy
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """
    Возвращает список воспоминаний агента с пагинацией (ALEX-TD-044).

    Проверяет ownership компании и существование агента.
    """
    # Проверяем ownership компании
    company_repo = CompanyRepository(session)
    try:
        company = company_repo.get(str(company_id))
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")
    if company.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Company not found")

    # Проверяем что агент существует и принадлежит компании
    agent_repo = AgentRepository(session)
    try:
        agent = agent_repo.get(str(agent_id))
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.company_id != str(company_id):
        raise HTTPException(status_code=404, detail="Agent not found")

    # ALEX-TD-298: use singleton MemoryService to avoid per-request sqlite3 connection
    # overhead. The underlying SqliteVecStore uses threading.Lock for safety.
    # ALEX-TD-085: close() is NOT called here — the singleton persists across requests.
    memory_service = _get_memory_store()
    memories = memory_service.get_all(agent_id=str(agent_id), limit=limit, offset=offset)

    return memories
