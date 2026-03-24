"""
M3-003: Company Templates + Onboarding endpoints.

GET  /api/templates                        → list all templates
POST /api/companies/from-template          → create company + agents in one transaction
"""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..db.session import get_session
from ..auth.dependencies import get_current_user
from ..orm.user import UserORM
from ..orm.company import CompanyORM
from ..orm.agent import AgentORM
from ..templates import TEMPLATES, get_template
from ..core.rate_limiting import limiter

# ALEX-TD-154: rate limit for template endpoints to prevent company creation abuse
_RATE_LIMIT_TEMPLATES_READ = os.environ.get("RATE_LIMIT_TEMPLATES_READ", "60/minute")
_RATE_LIMIT_TEMPLATES_CREATE = os.environ.get("RATE_LIMIT_TEMPLATES_CREATE", "5/hour")

router = APIRouter(tags=["templates"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class AgentTemplateOut(BaseModel):
    name: str
    role: str
    model: str
    system_prompt: str


class TemplateOut(BaseModel):
    id: str
    name: str
    description: str
    agents: list[AgentTemplateOut]


class CreateFromTemplateRequest(BaseModel):
    # ALEX-TD-180: max_length=100 prevents 10KB+ template_id strings reaching get_template()
    # dict-lookup. Template IDs are short slugs ("startup-team" = 12 chars); 100 is generous.
    # Consistent with other ID fields in the project (max_length=100).
    template_id: str = Field(max_length=100)
    # ALEX-TD-153: max_length=200 consistent with CompanyCreate (handlers/companies.py)
    name: str = Field(min_length=1, max_length=200)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v: str) -> str:
        if isinstance(v, str):
            stripped = v.strip()
            if not stripped:
                raise ValueError("Company name cannot be empty")
            return stripped
        return v


class AgentOut(BaseModel):
    id: str
    name: str
    role: str | None
    model: str
    system_prompt: str | None


class CompanyFromTemplateOut(BaseModel):
    id: str
    name: str
    agents: list[AgentOut]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/api/templates", response_model=list[TemplateOut])
@limiter.limit(_RATE_LIMIT_TEMPLATES_READ)
def list_templates(request: Request, current_user: UserORM = Depends(get_current_user)):
    """Return all available company templates."""
    return [
        TemplateOut(
            id=t["id"],
            name=t["name"],
            description=t["description"],
            agents=[AgentTemplateOut(**a) for a in t["agents"]],
        )
        for t in TEMPLATES
    ]


@router.post(
    "/api/companies/from-template",
    response_model=CompanyFromTemplateOut,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(_RATE_LIMIT_TEMPLATES_CREATE)
def create_from_template(
    request: Request,
    body: CreateFromTemplateRequest,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Create a company with preset agents from a template — one transaction."""
    template = get_template(body.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail=f"Template '{body.template_id}' not found")

    # Create company
    company_id = str(uuid.uuid4())
    company = CompanyORM(id=company_id, name=body.name, owner_id=current_user.id)
    session.add(company)

    # Create agents
    agent_orms = []
    for agent_def in template["agents"]:
        agent = AgentORM(
            id=str(uuid.uuid4()),
            company_id=company_id,
            name=agent_def["name"],
            role=agent_def["role"],
            model=agent_def["model"],
            system_prompt=agent_def["system_prompt"],
        )
        session.add(agent)
        agent_orms.append(agent)

    # Mark onboarding complete
    current_user.has_completed_onboarding = True
    session.add(current_user)

    session.commit()

    return CompanyFromTemplateOut(
        id=company_id,
        name=body.name,
        agents=[
            AgentOut(
                id=a.id,
                name=a.name,
                role=a.role,
                model=a.model,
                system_prompt=a.system_prompt,
            )
            for a in agent_orms
        ],
    )
