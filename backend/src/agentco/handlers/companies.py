from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db.session import get_session
from ..services.company import CompanyService
from ..repositories.base import NotFoundError

router = APIRouter(prefix="/api/companies", tags=["companies"])


# ── Schemas (HTTP layer only, не путать с domain models) ─────────────────────

class CompanyCreate(BaseModel):
    name: str

class CompanyOut(BaseModel):
    id: str
    name: str


def _to_out(company) -> CompanyOut:
    return CompanyOut(id=company.id, name=company.name)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[CompanyOut])
def list_companies(session: Session = Depends(get_session)):
    return [_to_out(c) for c in CompanyService(session).list_all()]


@router.post("/", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
def create_company(body: CompanyCreate, session: Session = Depends(get_session)):
    try:
        return _to_out(CompanyService(session).create(body.name))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(company_id: str, session: Session = Depends(get_session)):
    try:
        return _to_out(CompanyService(session).get(company_id))
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company(company_id: str, session: Session = Depends(get_session)):
    try:
        CompanyService(session).delete(company_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")
