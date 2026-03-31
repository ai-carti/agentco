"""M3-002: Agent Library + Portfolio endpoints."""
import logging
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..db.session import get_session
from ..auth.dependencies import get_current_user
from ..core.rate_limiting import limiter
from ..orm.user import UserORM
from sqlalchemy import update
from ..orm.agent_library import AgentLibraryORM
from ..orm.agent import AgentORM
from ..orm.company import CompanyORM

logger = logging.getLogger(__name__)

router = APIRouter(tags=["library"])

_RATE_LIMIT_FORK = os.getenv("RATE_LIMIT_FORK", "20/minute")
# ALEX-TD-113 fix: rate limit for POST /api/library — saves agent to shared library.
# Without limit, attacker can flood shared library with garbage agents.
_RATE_LIMIT_SAVE_LIBRARY = os.getenv("RATE_LIMIT_SAVE_LIBRARY", "10/minute")
# ALEX-TD-137: rate limit for GET /api/library and GET /api/library/{id}/portfolio.
# Both endpoints trigger DB reads (potentially large result sets). Without limit,
# they can be hammered to cause DB load. Default 60/minute is generous for read ops.
_RATE_LIMIT_LIBRARY_READ = os.getenv("RATE_LIMIT_LIBRARY_READ", "60/minute")


# ── Schemas ───────────────────────────────────────────────────────────────────

class LibrarySaveRequest(BaseModel):
    # ALEX-TD-172: max_length prevents 10KB+ agent_id strings reaching the DB lookup.
    # UUIDs are 36 chars; set 100 to allow future ID formats with generous headroom.
    agent_id: str = Field(max_length=100)


class LibraryAgentOut(BaseModel):
    id: str
    name: str
    role: str | None
    system_prompt: str | None
    model: str
    use_count: int
    # ALEX-TD-269: expose owner_id so frontend can implement "My Library" and
    # operators can audit who saved each agent. nullable because legacy entries have no owner.
    owner_id: str | None = None
    # ALEX-TD-295: emoji avatar — frontend LibraryPage.tsx renders it if present.
    # None for agents saved before this field was added.
    avatar: str | None = None

    model_config = {"from_attributes": True}


class ForkRequest(BaseModel):
    # ALEX-TD-172: max_length guard — consistent with LibrarySaveRequest.agent_id
    library_agent_id: str = Field(max_length=100)


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
@limiter.limit(_RATE_LIMIT_SAVE_LIBRARY)
def save_to_library(
    request: Request,
    body: LibrarySaveRequest,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Save an owned agent to the shared library so others can fork it."""
    # Find the agent
    agent = session.get(AgentORM, body.agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Check ownership via company
    company = session.get(CompanyORM, agent.company_id)
    if company is None or company.owner_id != current_user.id:
        # ALEX-TD-239: use 404 instead of 403 — uniform with all ownership checks in codebase.
        # 403 would reveal that the agent exists (info leak). 404 is OPSEC-safe.
        raise HTTPException(status_code=404, detail="Agent not found")

    lib_entry = AgentLibraryORM(
        id=str(uuid.uuid4()),
        name=agent.name,
        role=agent.role,
        system_prompt=agent.system_prompt,
        model=agent.model,
        use_count=0,
        # ALEX-TD-269: store owner_id for audit trail and future "My Library" filtering.
        owner_id=current_user.id,
    )
    session.add(lib_entry)
    session.commit()
    session.refresh(lib_entry)
    return lib_entry


# ── GET /api/library ──────────────────────────────────────────────────────────

_LIBRARY_SORT_FIELDS = {"created_at", "use_count"}

@router.get("/api/library", response_model=list[LibraryAgentOut])
@limiter.limit(_RATE_LIMIT_LIBRARY_READ)
def list_library(
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),  # ALEX-TD-238: le=500→100 consistent with ALEX-TD-236
    offset: int = Query(default=0, ge=0),
    # ALEX-TD-294: sort_by parameter — "created_at" (default) or "use_count" (popularity)
    sort_by: str = Query(default="created_at"),
    # ALEX-TD-296: mine=true filters by current user's saved agents (owner_id match)
    mine: bool = Query(default=False),
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),  # just requires auth
):
    """ALEX-TD-040: pagination added (default limit=50, max=500) to prevent OOM.
    ALEX-TD-062: ORDER BY created_at DESC for deterministic pagination cursor.
    ALEX-TD-294: sort_by parameter — "created_at" (default) or "use_count" (popularity).
    ALEX-TD-296: mine=true filters to current user's saved agents only.
    """
    # ALEX-TD-294: validate sort_by against allowlist to prevent SQL injection
    if sort_by not in _LIBRARY_SORT_FIELDS:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=422,
            detail=f"Invalid sort_by '{sort_by}'. Valid values: {sorted(_LIBRARY_SORT_FIELDS)}",
        )

    stmt = select(AgentLibraryORM)

    # ALEX-TD-296: mine=true — only show current user's saved agents
    if mine:
        stmt = stmt.where(AgentLibraryORM.owner_id == current_user.id)

    # ALEX-TD-294: sort by requested field DESC
    if sort_by == "use_count":
        stmt = stmt.order_by(AgentLibraryORM.use_count.desc(), AgentLibraryORM.created_at.desc())
    else:
        stmt = stmt.order_by(AgentLibraryORM.created_at.desc())

    stmt = stmt.limit(limit).offset(offset)
    entries = session.execute(stmt).scalars().all()
    return list(entries)


# ── GET /api/library/{id}/portfolio ───────────────────────────────────────────

@router.get("/api/library/{library_id}/portfolio", response_model=PortfolioOut)
@limiter.limit(_RATE_LIMIT_LIBRARY_READ)
def get_portfolio(
    request: Request,
    library_id: str,
    limit: int = Query(default=50, ge=1, le=100),  # ALEX-TD-238: le=500→100 consistent with ALEX-TD-236
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    lib_entry = session.get(AgentLibraryORM, library_id)
    if lib_entry is None:
        raise HTTPException(status_code=404, detail="Library agent not found")

    # ALEX-TD-103 fix: filter forks by current user's companies to prevent cross-tenant
    # data leak. Previously returned ALL forks from ALL users — any user could enumerate
    # other users' company_ids by querying portfolio of popular library agents.
    #
    # New query: JOIN agents → companies WHERE companies.owner_id = current_user.id
    # Each user sees only their own forks.
    from ..orm.company import CompanyORM as _CompanyORM
    forks = session.execute(
        select(AgentORM)
        .join(_CompanyORM, AgentORM.company_id == _CompanyORM.id)
        .where(AgentORM.library_agent_id == library_id)
        .where(_CompanyORM.owner_id == current_user.id)
        .order_by(AgentORM.created_at.asc())
        .limit(limit)
        .offset(offset)
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
@limiter.limit(_RATE_LIMIT_FORK)
def fork_agent(
    request: Request,
    company_id: uuid.UUID,
    body: ForkRequest,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Fork a library agent into the specified company. Increments the library agent's use_count."""
    # Check company ownership
    company = session.get(CompanyORM, str(company_id))
    if company is None or company.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Company not found")

    # Find library entry
    lib_entry = session.get(AgentLibraryORM, body.library_agent_id)
    if lib_entry is None:
        raise HTTPException(status_code=404, detail="Library agent not found")

    # Create forked agent
    new_agent = AgentORM(
        id=str(uuid.uuid4()),
        company_id=str(company_id),
        name=lib_entry.name,
        role=lib_entry.role,
        system_prompt=lib_entry.system_prompt,
        model=lib_entry.model,
        library_agent_id=lib_entry.id,
    )
    session.add(new_agent)

    # ALEX-TD-186: use atomic SQL UPDATE to prevent lost increments under concurrent forks.
    # ORM-level read-modify-write `lib_entry.use_count + 1` is a race condition:
    # two concurrent requests can both read use_count=N and both write N+1 → one increment lost.
    # `UPDATE ... SET use_count = use_count + 1` executes atomically in the DB.
    session.execute(
        update(AgentLibraryORM)
        .where(AgentLibraryORM.id == lib_entry.id)
        .values(use_count=AgentLibraryORM.use_count + 1)
    )

    session.commit()
    session.refresh(new_agent)
    return new_agent
