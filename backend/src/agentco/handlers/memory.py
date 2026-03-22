"""
handlers/memory.py — GET /api/companies/{company_id}/agents/{agent_id}/memory

M3-001: Endpoint для получения списка воспоминаний агента.
"""
from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from agentco.auth.dependencies import get_current_user
from agentco.db.session import get_session
from agentco.memory.service import MemoryService
from agentco.orm.user import UserORM
from agentco.repositories.agent import AgentRepository
from agentco.repositories.base import NotFoundError
from agentco.repositories.company import CompanyRepository

router = APIRouter(
    prefix="/api/companies/{company_id}/agents/{agent_id}/memory",
    tags=["memory"],
)

_MEMORY_DB = os.environ.get("AGENTCO_MEMORY_DB", "./agentco_memory.db")


@router.get("", response_model=list[dict])
def get_agent_memory(
    company_id: str,
    agent_id: str,
    limit: int = Query(default=50, ge=1, le=500),
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
        company = company_repo.get(company_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")
    if company.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Company not found")

    # Проверяем что агент существует и принадлежит компании
    agent_repo = AgentRepository(session)
    try:
        agent = agent_repo.get(agent_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.company_id != company_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Получаем воспоминания с пагинацией.
    # ALEX-TD-085: MemoryService создаётся внутри try/finally чтобы close() всегда вызывался
    # даже если конструктор или get_all бросит исключение.
    memory_service = None
    try:
        memory_service = MemoryService(_MEMORY_DB)
        memories = memory_service.get_all(agent_id=agent_id, limit=limit, offset=offset)
    finally:
        if memory_service is not None:
            memory_service.close()

    return memories
