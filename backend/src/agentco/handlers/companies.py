import os

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from ..db.session import get_session
from ..services.company import CompanyService
from ..repositories.base import NotFoundError
from ..auth.dependencies import get_current_user
from ..orm.user import User
from ..core.rate_limiting import limiter

_RATE_LIMIT_COMPANIES = os.getenv("RATE_LIMIT_COMPANIES", "5/hour")

router = APIRouter(prefix="/api/companies", tags=["companies"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class CompanyCreate(BaseModel):
    name: str = Field(..., min_length=1)

    @field_validator("name")
    @classmethod
    def name_must_not_be_whitespace(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("name must not be empty or whitespace-only")
        return stripped


class CompanyUpdate(BaseModel):
    name: str = Field(..., min_length=1)

    @field_validator("name")
    @classmethod
    def name_must_not_be_whitespace(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("name must not be empty or whitespace-only")
        return stripped

class CompanyOut(BaseModel):
    id: str
    name: str


def _to_out(company) -> CompanyOut:
    return CompanyOut(id=company.id, name=company.name)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[CompanyOut])
def list_companies(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return [_to_out(c) for c in CompanyService(session).list_all(owner_id=current_user.id)]


@router.post("/", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(_RATE_LIMIT_COMPANIES)
def create_company(
    request: Request,
    body: CompanyCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        return _to_out(CompanyService(session).create(body.name, owner_id=current_user.id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(
    company_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # ALEX-TD-057: ownership check consolidated in service.get_owned()
    try:
        company = CompanyService(session).get_owned(company_id, owner_id=current_user.id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")
    return _to_out(company)


@router.put("/{company_id}", response_model=CompanyOut)
def update_company(
    company_id: str,
    body: CompanyUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # ALEX-TD-054: single DB hit — ownership check + update merged in service
    try:
        return _to_out(CompanyService(session).update(company_id, body.name, owner_id=current_user.id))
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company(
    company_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # ALEX-TD-054: single DB hit — ownership check + delete merged in service
    try:
        CompanyService(session).delete_owned(company_id, owner_id=current_user.id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")
