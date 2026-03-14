from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from ..db.session import get_session
from ..services.agent import AgentService
from ..repositories.base import NotFoundError
from ..auth.dependencies import get_current_user
from ..orm.user import User

router = APIRouter(prefix="/api/companies/{company_id}/agents", tags=["agents"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1)
    role: str | None = None
    system_prompt: str | None = None
    model: str = "gpt-4o-mini"

    @field_validator("name")
    @classmethod
    def name_must_not_be_whitespace(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("name must not be empty or whitespace-only")
        return stripped


class AgentUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    system_prompt: str | None = None
    model: str | None = None


class AgentOut(BaseModel):
    id: str
    company_id: str
    name: str
    role: str | None
    system_prompt: str | None
    model: str

    model_config = {"from_attributes": True}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
def create_agent(
    company_id: str,
    body: AgentCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        return AgentService(session).create(
            company_id=company_id,
            owner_id=current_user.id,
            **body.model_dump(),
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")


@router.get("", response_model=list[AgentOut])
def list_agents(
    company_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        return AgentService(session).list_by_company(
            company_id=company_id,
            owner_id=current_user.id,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")


@router.get("/{agent_id}", response_model=AgentOut)
def get_agent(
    company_id: str,
    agent_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
):
    try:
        AgentService(session).delete(
            company_id=company_id,
            agent_id=agent_id,
            owner_id=current_user.id,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Agent not found")
