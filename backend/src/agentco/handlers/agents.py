import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from ..db.session import get_session
from ..services.agent import AgentService
from ..repositories.base import NotFoundError
from ..auth.dependencies import get_current_user
from ..orm.user import UserORM
from ..core.rate_limiting import limiter

_RATE_LIMIT_AGENTS = os.getenv("RATE_LIMIT_AGENTS", "20/hour")
# ALEX-TD-102: separate rate limit for tree endpoint — recursive tree build is O(N agents)
_RATE_LIMIT_AGENTS_TREE = os.getenv("RATE_LIMIT_AGENTS_TREE", "30/minute")

router = APIRouter(prefix="/api/companies/{company_id}/agents", tags=["agents"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class AgentCreate(BaseModel):
    # ALEX-TD-072: max_length guards to prevent oversized payloads
    name: str = Field(..., min_length=1, max_length=200)
    role: str | None = Field(default=None, max_length=200)
    system_prompt: str | None = Field(default=None, max_length=10000)
    model: str = Field(default="gpt-4o-mini", max_length=100)
    parent_agent_id: str | None = None  # POST-006

    @field_validator("name")
    @classmethod
    def name_must_not_be_whitespace(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("name must not be empty or whitespace-only")
        return stripped


class AgentUpdate(BaseModel):
    # ALEX-TD-072: max_length mirrors AgentCreate
    name: str | None = Field(default=None, min_length=1, max_length=200)
    role: str | None = Field(default=None, max_length=200)
    system_prompt: str | None = Field(default=None, max_length=10000)
    model: str | None = Field(default=None, max_length=100)

    @field_validator("name")
    @classmethod
    def name_must_not_be_whitespace(cls, v: str | None) -> str | None:
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("name must not be empty or whitespace-only")
        return stripped


class AgentOut(BaseModel):
    id: str
    company_id: str
    name: str
    role: str | None
    system_prompt: str | None
    model: str
    parent_agent_id: str | None = None  # POST-006
    hierarchy_level: int = 0            # POST-006

    model_config = {"from_attributes": True}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(_RATE_LIMIT_AGENTS)
def create_agent(
    request: Request,
    company_id: str,
    body: AgentCreate,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    try:
        return AgentService(session).create(
            company_id=company_id,
            owner_id=current_user.id,
            **body.model_dump(),
        )
    except NotFoundError as e:
        detail = str(e)
        if "Parent" in detail:
            raise HTTPException(status_code=404, detail="Parent agent not found")
        raise HTTPException(status_code=404, detail="Company not found")


@router.get("/tree", response_model=list[Any])
@limiter.limit(_RATE_LIMIT_AGENTS_TREE)
def get_agents_tree(
    request: Request,
    company_id: str,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """
    POST-006: Returns agents as a nested tree.
    Each node has: id, name, role, model, hierarchy_level, parent_agent_id, children[].
    """
    try:
        return AgentService(session).get_tree(
            company_id=company_id,
            owner_id=current_user.id,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")


@router.get("", response_model=list[AgentOut])
def list_agents(
    company_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    try:
        return AgentService(session).list_by_company(
            company_id=company_id,
            owner_id=current_user.id,
            limit=limit,
            offset=offset,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")


@router.get("/{agent_id}", response_model=AgentOut)
def get_agent(
    company_id: str,
    agent_id: str,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    try:
        return AgentService(session).get(
            company_id=company_id,
            agent_id=agent_id,
            owner_id=current_user.id,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Agent not found")


@router.put("/{agent_id}", response_model=AgentOut)
def update_agent(
    company_id: str,
    agent_id: str,
    body: AgentUpdate,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    try:
        return AgentService(session).update(
            company_id=company_id,
            agent_id=agent_id,
            owner_id=current_user.id,
            **body.model_dump(exclude_none=True),
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Agent not found")


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(
    company_id: str,
    agent_id: str,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    try:
        AgentService(session).delete(
            company_id=company_id,
            agent_id=agent_id,
            owner_id=current_user.id,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Agent not found")
