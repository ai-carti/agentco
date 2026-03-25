import asyncio
import logging
import uuid
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..core.rate_limiting import limiter
from ..db.session import get_session
from ..llm.client import acompletion  # module-level import for testability
from ..orm.user import UserORM
from ..repositories.base import NotFoundError, ConflictError
from ..services.credential import CredentialService

logger = logging.getLogger(__name__)

# ALEX-TD-050: rate limit for validate-key endpoint — each call makes a real LLM request
_RATE_LIMIT_VALIDATE_KEY = os.getenv("RATE_LIMIT_VALIDATE_KEY", "5/minute")
# ALEX-TD-132: rate limit for credential CRUD endpoints
_RATE_LIMIT_CREDENTIALS = os.getenv("RATE_LIMIT_CREDENTIALS", "30/minute")

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
    # ALEX-TD-182: max_length=50 consistent with ValidateKeyRequest.provider (ALEX-TD-115).
    # Pydantic allocates the full string before field_validator runs — max_length rejects early.
    provider: str = Field(max_length=50)
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
@limiter.limit(_RATE_LIMIT_CREDENTIALS)
def create_credential(
    request: Request,
    company_id: uuid.UUID,
    body: CredentialCreate,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    try:
        return CredentialService(session).create(
            company_id=str(company_id),
            provider=body.provider,
            api_key=body.api_key,
            owner_id=current_user.id,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ConflictError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.get(
    "/api/companies/{company_id}/credentials",
    response_model=list[CredentialOut],
)
@limiter.limit(_RATE_LIMIT_CREDENTIALS)
def list_credentials(
    request: Request,
    company_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    # ALEX-TD-098: pagination to prevent unbounded result sets
    try:
        return CredentialService(session).list_by_company(
            company_id=str(company_id),
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
@limiter.limit(_RATE_LIMIT_CREDENTIALS)
def delete_credential(
    request: Request,
    company_id: uuid.UUID,
    credential_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    try:
        CredentialService(session).delete(
            company_id=str(company_id),
            credential_id=str(credential_id),
            owner_id=current_user.id,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── LLM providers endpoints ───────────────────────────────────────────────────

@router.get("/api/llm/providers", response_model=list[str])
@limiter.limit(_RATE_LIMIT_CREDENTIALS)
def list_llm_providers(
    request: Request,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    # ALEX-TD-168: rate limit added — list_providers_for_user does JOIN across all
    # user's companies; without limit an authenticated user can hammer this O(N) query.
    return CredentialService(session).list_providers_for_user(owner_id=current_user.id)


@router.get("/api/llm/providers/available")
@limiter.limit(_RATE_LIMIT_CREDENTIALS)
def list_available_providers(
    request: Request,
    current_user: UserORM = Depends(get_current_user),
):
    """Return all supported providers with their model lists (no key required).

    ALEX-TD-168: rate limit added — authenticated endpoint, DB read on every request.
    """
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

    @field_validator("provider")
    @classmethod
    def provider_must_be_known(cls, v: str) -> str:
        """ALEX-TD-187: validate provider at Pydantic level (422) instead of runtime 200+error.

        CredentialCreate already does this — ValidateKeyRequest was inconsistent.
        Known providers: openai, anthropic, gemini (must match PROVIDER_TEST_MODEL).
        """
        v_normalized = v.lower().strip()
        if v_normalized not in PROVIDER_TEST_MODEL:
            allowed = ", ".join(sorted(PROVIDER_TEST_MODEL.keys()))
            raise ValueError(f"Unknown provider '{v}'. Allowed: {allowed}")
        return v_normalized

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
    # ALEX-TD-163: `import os` and `from ..llm.client import acompletion` moved to module level
    # ALEX-TD-187: provider is now validated by ValidateKeyRequest.provider_must_be_known
    # → will never be unknown here (Pydantic returns 422 before reaching this handler).
    # Keep runtime check as a defensive guard, but it should never trigger.

    provider = body.provider  # already normalized (lowercased) by field_validator
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

    # ALEX-TD-160: wrap acompletion in wait_for to prevent hung LLM requests from
    # exhausting server threads. 30s is plenty for a "Hi" / max_tokens=1 test call.
    _VALIDATE_TIMEOUT = float(os.getenv("VALIDATE_KEY_TIMEOUT_SEC", "30"))
    try:
        await asyncio.wait_for(acompletion(**litellm_kwargs), timeout=_VALIDATE_TIMEOUT)
        return ValidateKeyResponse(valid=True)
    except asyncio.TimeoutError:
        return ValidateKeyResponse(valid=False, error="Request timed out — LLM API did not respond")
    except Exception as e:
        return ValidateKeyResponse(valid=False, error=str(e))
