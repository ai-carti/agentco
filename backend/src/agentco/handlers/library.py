"""M3-002: Agent Library + Portfolio endpoints."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..db.session import get_session
from ..auth.dependencies import get_current_user
from ..orm.user import User
from ..orm.agent_library import AgentLibraryORM
from ..orm.agent import AgentORM
from ..orm.company import CompanyORM

router = APIRouter(tags=["library"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class LibrarySaveRequest(BaseModel):
    agent_id: str


class LibraryAgentOut(BaseModel):
    id: str
    name: str
    role: str | None
    system_prompt: str | None
    model: str
    use_count: int

    model_config = {"from_attributes": True}


class ForkRequest(BaseModel):
    library_agent_id: str


class AgentOut(BaseModel):
    id: str
    company_id: str
    name: str
    role: str | None
    system_prompt: str | None
    model: str
    library_agent_id: str | None

    model_config = {"from_attributes": True}


class PortfolioForkOut(BaseModel):
    id: str
    company_id: str
    name: str
    library_agent_id: str | None

    model_config = {"from_attributes": True}


class PortfolioOut(BaseModel):
    library_agent: LibraryAgentOut
    forks: list[PortfolioForkOut]


# ── POST /api/library ─────────────────────────────────────────────────────────

@router.post("/api/library", response_model=LibraryAgentOut, status_code=status.HTTP_201_CREATED)
def save_to_library(
    body: LibrarySaveRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # Find the agent
    agent = session.get(AgentORM, body.agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Check ownership via company
    company = session.get(CompanyORM, agent.company_id)
    if company is None or company.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    lib_entry = AgentLibraryORM(
        id=str(uuid.uuid4()),
        name=agent.name,
        role=agent.role,
        system_prompt=agent.system_prompt,
        model=agent.model,
        use_count=0,
    )
    session.add(lib_entry)
    session.commit()
    session.refresh(lib_entry)
    return lib_entry


# ── GET /api/library ──────────────────────────────────────────────────────────

@router.get("/api/library", response_model=list[LibraryAgentOut])
def list_library(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),  # just requires auth
):
    entries = session.execute(select(AgentLibraryORM)).scalars().all()
    return list(entries)


# ── GET /api/library/{id}/portfolio ───────────────────────────────────────────

@router.get("/api/library/{library_id}/portfolio", response_model=PortfolioOut)
def get_portfolio(
    library_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    lib_entry = session.get(AgentLibraryORM, library_id)
    if lib_entry is None:
        raise HTTPException(status_code=404, detail="Library agent not found")

    # Find all agents forked from this library entry
    forks = session.execute(
        select(AgentORM).where(AgentORM.library_agent_id == library_id)
    ).scalars().all()

    return PortfolioOut(
        library_agent=LibraryAgentOut.model_validate(lib_entry),
        forks=[PortfolioForkOut.model_validate(f) for f in forks],
    )


# ── POST /api/companies/{company_id}/agents/fork ──────────────────────────────

@router.post(
    "/api/companies/{company_id}/agents/fork",
    response_model=AgentOut,
    status_code=status.HTTP_201_CREATED,
)
def fork_agent(
    company_id: str,
    body: ForkRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # Check company ownership
    company = session.get(CompanyORM, company_id)
    if company is None or company.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Company not found")

    # Find library entry
    lib_entry = session.get(AgentLibraryORM, body.library_agent_id)
    if lib_entry is None:
        raise HTTPException(status_code=404, detail="Library agent not found")

    # Create forked agent
    new_agent = AgentORM(
        id=str(uuid.uuid4()),
        company_id=company_id,
        name=lib_entry.name,
        role=lib_entry.role,
        system_prompt=lib_entry.system_prompt,
        model=lib_entry.model,
        library_agent_id=lib_entry.id,
    )
    session.add(new_agent)

    # Increment use_count
    lib_entry.use_count = (lib_entry.use_count or 0) + 1

    session.commit()
    session.refresh(new_agent)
    return new_agent
