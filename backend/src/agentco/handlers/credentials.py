from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db.session import get_session
from ..services.credential import CredentialService
from ..repositories.base import NotFoundError
from ..auth.dependencies import get_current_user
from ..orm.user import User

router = APIRouter(tags=["credentials"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class CredentialCreate(BaseModel):
    provider: str
    api_key: str


class CredentialOut(BaseModel):
    id: str
    provider: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Endpoints: /api/companies/{company_id}/credentials ────────────────────────

@router.post(
    "/api/companies/{company_id}/credentials",
    response_model=CredentialOut,
    status_code=status.HTTP_201_CREATED,
)
def create_credential(
    company_id: str,
    body: CredentialCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        return CredentialService(session).create(
            company_id=company_id,
            provider=body.provider,
            api_key=body.api_key,
            owner_id=current_user.id,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get(
    "/api/companies/{company_id}/credentials",
    response_model=list[CredentialOut],
)
def list_credentials(
    company_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        return CredentialService(session).list_by_company(
            company_id=company_id,
            owner_id=current_user.id,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete(
    "/api/companies/{company_id}/credentials/{credential_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_credential(
    company_id: str,
    credential_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        CredentialService(session).delete(
            company_id=company_id,
            credential_id=credential_id,
            owner_id=current_user.id,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── LLM providers endpoint ────────────────────────────────────────────────────

@router.get("/api/llm/providers", response_model=list[str])
def list_llm_providers(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return CredentialService(session).list_providers_for_user(owner_id=current_user.id)
