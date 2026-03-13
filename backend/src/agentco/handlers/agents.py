from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db.session import get_session
from ..services.agent import AgentService
from ..repositories.base import NotFoundError

router = APIRouter(prefix="/api/agents", tags=["agents"])


class AgentCreate(BaseModel):
    company_id: str
    name: str
    role: str | None = None
    system_prompt: str | None = None
    model: str = "gpt-4o-mini"

class AgentOut(BaseModel):
    id: str
    company_id: str
    name: str
    role: str | None
    model: str

    model_config = {"from_attributes": True}


@router.post("/", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
def create_agent(body: AgentCreate, session: Session = Depends(get_session)):
    try:
        return AgentService(session).create(**body.model_dump())
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")


@router.get("/{agent_id}", response_model=AgentOut)
def get_agent(agent_id: str, session: Session = Depends(get_session)):
    try:
        return AgentService(session).get(agent_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Agent not found")


@router.get("/by-company/{company_id}", response_model=list[AgentOut])
def list_agents(company_id: str, session: Session = Depends(get_session)):
    return AgentService(session).list_by_company(company_id)
