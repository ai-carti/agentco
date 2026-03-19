from datetime import datetime
from enum import Enum
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..db.session import get_session
from ..auth.dependencies import get_current_user
from ..orm.user import User
from ..orm.mcp_server import MCPServerORM
from ..repositories.base import NotFoundError
from ..repositories.agent import AgentRepository
from ..repositories.company import CompanyRepository

router = APIRouter(
    prefix="/api/companies/{company_id}/agents/{agent_id}/mcp-servers",
    tags=["mcp-servers"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────

class TransportEnum(str, Enum):
    stdio = "stdio"
    sse = "sse"


class MCPServerCreate(BaseModel):
    name: str = Field(..., min_length=1)
    server_url: str = Field(..., min_length=1)
    transport: TransportEnum

    @field_validator("server_url")
    @classmethod
    def url_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("server_url must not be empty or whitespace-only")
        return v


class MCPServerResponse(BaseModel):
    id: str
    name: str
    server_url: str
    transport: str
    enabled: bool

    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_agent(session: Session, company_id: str, agent_id: str, owner_id: str) -> None:
    """Check company ownership and agent existence. Raises 404 via HTTPException."""
    company_repo = CompanyRepository(session)
    agent_repo = AgentRepository(session)
    try:
        company = company_repo.get(company_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")
    if company.owner_id != owner_id:
        raise HTTPException(status_code=404, detail="Company not found")
    try:
        agent = agent_repo.get(agent_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.company_id != company_id:
        raise HTTPException(status_code=404, detail="Agent not found")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=MCPServerResponse, status_code=status.HTTP_201_CREATED)
def create_mcp_server(
    company_id: str,
    agent_id: str,
    body: MCPServerCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _resolve_agent(session, company_id, agent_id, current_user.id)

    # Check duplicate name for this agent
    existing = session.scalars(
        select(MCPServerORM).where(
            MCPServerORM.agent_id == agent_id,
            MCPServerORM.name == body.name,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"MCP server with name '{body.name}' already exists for this agent")

    mcp = MCPServerORM(
        agent_id=agent_id,
        name=body.name,
        server_url=body.server_url,
        transport=body.transport.value,
    )
    session.add(mcp)
    session.commit()
    session.refresh(mcp)
    return mcp


@router.get("", response_model=list[MCPServerResponse])
def list_mcp_servers(
    company_id: str,
    agent_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _resolve_agent(session, company_id, agent_id, current_user.id)
    servers = session.scalars(
        select(MCPServerORM)
        .where(MCPServerORM.agent_id == agent_id)
        .offset(offset)
        .limit(limit)
    ).all()
    return list(servers)


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mcp_server(
    company_id: str,
    agent_id: str,
    server_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _resolve_agent(session, company_id, agent_id, current_user.id)
    mcp = session.get(MCPServerORM, server_id)
    if mcp is None or mcp.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="MCP server not found")
    session.delete(mcp)
    session.commit()
