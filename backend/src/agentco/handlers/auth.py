"""Auth endpoints: register + login + protected /me."""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db.session import get_session
from ..orm.user import UserORM
from ..auth.security import hash_password, verify_password, create_access_token
from ..auth.dependencies import get_current_user
from ..core.rate_limiting import limiter

router = APIRouter(prefix="/auth", tags=["auth"])

# ALEX-TD-047 fix: rate limits for auth endpoints — brute-force protection
# Configurable via env vars so production can tighten limits without code changes.
_RATE_LIMIT_REGISTER = os.getenv("RATE_LIMIT_AUTH_REGISTER", "5/minute")
_RATE_LIMIT_LOGIN = os.getenv("RATE_LIMIT_AUTH_LOGIN", "10/minute")


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_constraints(cls, v: str) -> str:
        if len(v) == 0:
            raise ValueError("Password must not be empty")
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password cannot be longer than 72 bytes (bcrypt limit)")
        return v


class RegisterResponse(BaseModel):
    id: str


class LoginRequest(BaseModel):
    email: str
    password: str


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
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me", response_model=MeResponse)
def me(current_user: UserORM = Depends(get_current_user)):
    """Protected endpoint: returns current user info."""
    return MeResponse(
        id=current_user.id,
        email=current_user.email,
        has_completed_onboarding=bool(current_user.has_completed_onboarding),
    )
