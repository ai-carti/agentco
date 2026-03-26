import logging
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from ..db.session import get_session
from ..services.company import CompanyService
from ..repositories.base import NotFoundError
from ..auth.dependencies import get_current_user
from ..orm.user import UserORM
from ..core.rate_limiting import limiter

logger = logging.getLogger(__name__)

_RATE_LIMIT_COMPANIES = os.getenv("RATE_LIMIT_COMPANIES", "5/hour")
# ALEX-TD-156: separate rate limit for read endpoints (list + get)
_RATE_LIMIT_COMPANIES_READ = os.getenv("RATE_LIMIT_COMPANIES_READ", "120/minute")

router = APIRouter(prefix="/api/companies", tags=["companies"])


# ── Schemas ───────────────────────────────────────────────────────────────────

def _validate_company_name(v: str) -> str:
    """ALEX-TD-076: shared validator — strip and reject whitespace-only names."""
    stripped = v.strip()
    if not stripped:
        raise ValueError("name must not be empty or whitespace-only")
    return stripped


class CompanyCreate(BaseModel):
    # ALEX-TD-166: max_length=200 mirrors CompanyFromTemplateRequest and prevents megabyte payloads.
    # Regression fix: ALEX-TD-109 was marked "fixed" in ROADMAP but max_length was never added.
    name: str = Field(..., min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def name_must_not_be_whitespace(cls, v: str) -> str:
        return _validate_company_name(v)


class CompanyUpdate(BaseModel):
    # ALEX-TD-166: max_length=200 mirrors CompanyCreate (see above).
    name: str = Field(..., min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def name_must_not_be_whitespace(cls, v: str) -> str:
        return _validate_company_name(v)

class CompanyOut(BaseModel):
    id: str
    name: str


def _to_out(company) -> CompanyOut:
    return CompanyOut(id=company.id, name=company.name)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[CompanyOut])
@limiter.limit(_RATE_LIMIT_COMPANIES_READ)
def list_companies(
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """List all companies owned by the current user.

    ALEX-TD-251: added limit/offset pagination (le=100, consistent with ALEX-TD-236/238).
    Previously returned all companies in a single unbounded SELECT — risk of OOM with many companies.
    """
    return [_to_out(c) for c in CompanyService(session).list_all(
        owner_id=current_user.id,
        limit=limit,
        offset=offset,
    )]


@router.post("/", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(_RATE_LIMIT_COMPANIES)
def create_company(
    request: Request,
    body: CompanyCreate,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Create a new company owned by the current user."""
    try:
        return _to_out(CompanyService(session).create(body.name, owner_id=current_user.id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{company_id}", response_model=CompanyOut)
@limiter.limit(_RATE_LIMIT_COMPANIES_READ)
def get_company(
    request: Request,
    company_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Retrieve a single company by ID (must be owned by current user).

    Returns 404 if the company does not exist or belongs to another user.
    """
    # ALEX-TD-057: ownership check consolidated in service.get_owned()
    # ALEX-TD-207: company_id is uuid.UUID — FastAPI returns 422 for non-UUID values.
    try:
        company = CompanyService(session).get_owned(str(company_id), owner_id=current_user.id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")
    return _to_out(company)


@router.put("/{company_id}", response_model=CompanyOut)
@limiter.limit(_RATE_LIMIT_COMPANIES)
def update_company(
    request: Request,
    company_id: uuid.UUID,
    body: CompanyUpdate,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Update company name. Only the owner may update their company.

    Returns 404 if not found or not owned; 400 on invalid name.
    """
    # ALEX-TD-054: single DB hit — ownership check + update merged in service
    # ALEX-TD-207: company_id is uuid.UUID
    try:
        return _to_out(CompanyService(session).update(str(company_id), body.name, owner_id=current_user.id))
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(_RATE_LIMIT_COMPANIES)
def delete_company(
    request: Request,
    company_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Delete a company and all its data. Only the owner may delete their company.

    Returns 204 on success; 404 if not found or not owned.
    """
    # ALEX-TD-054: single DB hit — ownership check + delete merged in service
    # ALEX-TD-207: company_id is uuid.UUID
    try:
        CompanyService(session).delete_owned(str(company_id), owner_id=current_user.id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")
