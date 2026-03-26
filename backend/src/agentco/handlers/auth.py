"""Auth endpoints: register + login + protected /me."""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db.session import get_session
from ..orm.user import UserORM
from ..auth.security import hash_password, verify_password, create_access_token, DUMMY_HASH
from ..auth.dependencies import get_current_user
from ..core.rate_limiting import limiter

router = APIRouter(prefix="/auth", tags=["auth"])

# ALEX-TD-047 fix: rate limits for auth endpoints — brute-force protection
# Configurable via env vars so production can tighten limits without code changes.
_RATE_LIMIT_REGISTER = os.getenv("RATE_LIMIT_AUTH_REGISTER", "5/minute")
_RATE_LIMIT_LOGIN = os.getenv("RATE_LIMIT_AUTH_LOGIN", "10/minute")
# ALEX-TD-157: rate limit for /me — prevents unbounded authenticated polling
# (JWT decode + DB lookup on every request).
_RATE_LIMIT_ME = os.getenv("RATE_LIMIT_AUTH_ME", "120/minute")


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    # ALEX-TD-167: explicit max_length=254 (RFC 5321 max email length).
    # pydantic EmailStr already enforces this at runtime, but adding max_length makes the
    # constraint visible in OpenAPI schema — important for client-side validation and docs.
    email: EmailStr = Field(max_length=254)
    # ALEX-TD-170: max_length=128 as an early-rejection guard.
    # Without it, Pydantic allocates the full string (e.g. 100MB) before the custom
    # validator can check byte length. With max_length=128, Pydantic rejects at field
    # validation — before the custom validator runs and before the string is hashed.
    # 128 > 72 (bcrypt limit) so the custom validator still enforces the bcrypt guard.
    password: str = Field(max_length=128)

    @field_validator("password")
    @classmethod
    def password_constraints(cls, v: str) -> str:
        if len(v) == 0:
            raise ValueError("Password must not be empty")
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password cannot be longer than 72 bytes (bcrypt limit)")
        return v


class RegisterResponse(BaseModel):
    id: str


class LoginRequest(BaseModel):
    # ALEX-TD-112 fix: EmailStr for consistent validation + str on password with max_length
    # to prevent bcrypt DoS (>72 bytes is truncated — sending 100KB strings is wasteful).
    # ALEX-TD-169: max_length=254 mirrors RegisterRequest (RFC 5321 max email length).
    # Without this, POST /auth/login accepts 10KB+ email strings → DB query with large buffer.
    email: EmailStr = Field(max_length=254)
    password: str = Field(max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: str
    email: str
    has_completed_onboarding: bool


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(_RATE_LIMIT_REGISTER)
def register(request: Request, body: RegisterRequest, session: Session = Depends(get_session)):
    """Register a new user. Returns user id."""
    # ALEX-TD-005 fix: modern select() API
    existing = session.scalars(select(UserORM).where(UserORM.email == body.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = UserORM(
        id=str(uuid.uuid4()),
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    session.add(user)
    session.commit()
    return RegisterResponse(id=user.id)


@router.post("/login", response_model=TokenResponse)
@limiter.limit(_RATE_LIMIT_LOGIN)
def login(request: Request, body: LoginRequest, session: Session = Depends(get_session)):
    """Authenticate user and return JWT access token."""
    # ALEX-TD-005 fix: modern select() API
    user = session.scalars(select(UserORM).where(UserORM.email == body.email)).first()
    # ALEX-TD-229: constant-time path to prevent email enumeration via timing.
    # Always run bcrypt verify — even when user is not found — so response time
    # is ~100ms regardless of whether the email is registered.
    # Without this, `not user or not verify_password(...)` short-circuits when user=None
    # (bcrypt skipped → ~1ms response) vs found+wrong-password (~100ms) → timing leak.
    candidate_hash = user.hashed_password if user else DUMMY_HASH
    password_ok = verify_password(body.password, candidate_hash)
    if not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/logout", status_code=status.HTTP_200_OK)
def logout():
    """Logout is client-side only — token remains valid until expiry.

    This endpoint is a no-op on the backend. JWT tokens are stateless and
    cannot be invalidated server-side without a token revocation store (e.g. Redis
    blocklist). The client must delete the token from localStorage/cookies.

    Mitigation: short TTL (ACCESS_TOKEN_EXPIRE_MINUTES=60). For stronger security,
    implement a server-side blocklist (ALEX-TD-231 full fix).
    """
    return {"message": "logged out"}


@router.get("/me", response_model=MeResponse)
@limiter.limit(_RATE_LIMIT_ME)
def me(request: Request, current_user: UserORM = Depends(get_current_user)):
    """Protected endpoint: returns current user info."""
    return MeResponse(
        id=current_user.id,
        email=current_user.email,
        has_completed_onboarding=bool(current_user.has_completed_onboarding),
    )
