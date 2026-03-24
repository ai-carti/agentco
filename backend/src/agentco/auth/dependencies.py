"""FastAPI dependencies for auth."""
import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db.session import get_session
from ..orm.user import UserORM
from .security import decode_access_token

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> UserORM:
    """Validate Bearer token and return the authenticated user."""
    try:
        user_id = decode_access_token(credentials.credentials)
    except Exception as e:
        logger.warning("Unexpected error decoding token: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ALEX-TD-005 fix: use modern select() instead of legacy session.query()
    user = session.scalars(select(UserORM).where(UserORM.id == user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user
