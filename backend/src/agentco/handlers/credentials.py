from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from sqlalchemy.orm import Session
from ..db.session import get_session
from ..services.credential import CredentialService
from ..repositories.base import NotFoundError
from ..auth.dependencies import get_current_user
from ..orm.user import UserORM
from ..core.rate_limiting import limiter
import os

# ALEX-TD-050: rate limit for validate-key endpoint — each call makes a real LLM request
_RATE_LIMIT_VALIDATE_KEY = os.getenv("RATE_LIMIT_VALIDATE_KEY", "5/minute")

router = APIRouter(tags=["credentials"])


# ── LLM provider/model registry ───────────────────────────────────────────────

PROVIDER_MODELS: dict[str, list[str]] = {
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    "anthropic": [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
        "claude-sonnet-4-5",
    ],
    "gemini": ["gemini/gemini-1.5-pro", "gemini/gemini-1.5-flash"],
}

# Flat model list for easy search
ALL_MODELS: list[str] = [m for models in PROVIDER_MODELS.values() for m in models]

# Canonical test model per provider (cheap, fast)
PROVIDER_TEST_MODEL: dict[str, str] = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-20241022",
    "gemini": "gemini/gemini-1.5-flash",
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class CredentialCreate(BaseModel):
    provider: str
    # ALEX-TD-093: max_length=512 prevents multi-MB payloads.
    # Real API keys (OpenAI sk-..., Anthropic sk-ant-..., Gemini AIza...) are ≤ 200 chars.
    api_key: str = Field(max_length=512)

    @field_validator("provider")
    @classmethod
    def provider_must_be_known(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in PROVIDER_MODELS:
            allowed = ", ".join(sorted(PROVIDER_MODELS.keys()))
            raise ValueError(f"Unknown provider '{v}'. Allowed: {allowed}")
        return v

    @field_validator("api_key")
    @classmethod
    def api_key_must_not_be_empty(cls, v: str) -> str:
        """ALEX-TD-029: api_key не может быть пустым или whitespace-only."""
        v_stripped = v.strip()
        if not v_stripped:
            raise ValueError("api_key must not be empty")
        return v_stripped


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
    current_user: UserORM = Depends(get_current_user),
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
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    # ALEX-TD-098: pagination to prevent unbounded result sets
    try:
        return CredentialService(session).list_by_company(
            company_id=company_id,
            owner_id=current_user.id,
            limit=limit,
            offset=offset,
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
    current_user: UserORM = Depends(get_current_user),
):
    try:
        CredentialService(session).delete(
            company_id=company_id,
            credential_id=credential_id,
            owner_id=current_user.id,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── LLM providers endpoints ───────────────────────────────────────────────────

@router.get("/api/llm/providers", response_model=list[str])
def list_llm_providers(
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    return CredentialService(session).list_providers_for_user(owner_id=current_user.id)


@router.get("/api/llm/providers/available")
def list_available_providers(
    current_user: UserORM = Depends(get_current_user),
):
    """Return all supported providers with their model lists (no key required)."""
    return {
        "providers": [
            {"provider": provider, "models": models}
            for provider, models in PROVIDER_MODELS.items()
        ],
        "all_models": ALL_MODELS,
    }


class ValidateKeyRequest(BaseModel):
    # ALEX-TD-115 fix: max_length guards — mirrors CredentialCreate (regression from ALEX-TD-110)
    provider: str = Field(max_length=50)
    api_key: str = Field(max_length=512)

    @field_validator("api_key")
    @classmethod
    def api_key_must_not_be_empty(cls, v: str) -> str:
        v_stripped = v.strip()
        if not v_stripped:
            raise ValueError("api_key must not be empty")
        return v_stripped


class ValidateKeyResponse(BaseModel):
    valid: bool
    error: Optional[str] = None


@router.post("/api/llm/validate-key", response_model=ValidateKeyResponse)
@limiter.limit(_RATE_LIMIT_VALIDATE_KEY)
async def validate_llm_key(
    request: Request,
    body: ValidateKeyRequest,
    current_user: UserORM = Depends(get_current_user),
):
    """Validate an LLM API key by making a minimal test request."""
    import os
    from ..llm.client import acompletion

    provider = body.provider.lower()
    if provider not in PROVIDER_TEST_MODEL:
        return ValidateKeyResponse(valid=False, error=f"Unknown provider: {body.provider}")

    test_model = PROVIDER_TEST_MODEL[provider]

    # ALEX-TD-009 fix: pass api_key directly to LiteLLM instead of mutating os.environ
    # (os.environ mutation is NOT thread-safe in async context — concurrent requests
    #  can end up using each other's keys)
    # ALEX-TD-058 fix: removed dead if/elif — all providers pass api_key identically.
    litellm_kwargs: dict = {
        "model": test_model,
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 1,
        "api_key": body.api_key,
    }

    try:
        await acompletion(**litellm_kwargs)
        return ValidateKeyResponse(valid=True)
    except Exception as e:
        return ValidateKeyResponse(valid=False, error=str(e))
