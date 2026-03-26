"""Password hashing and JWT utilities."""
import logging
import os
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

_DEV_SECRET = "dev-secret-change-in-production-x32"
SECRET_KEY = os.getenv("SECRET_KEY", _DEV_SECRET)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# ALEX-TD-010: warn if running with dev secret in prod
if SECRET_KEY == _DEV_SECRET:
    logger.warning(
        "SECURITY WARNING: SECRET_KEY is not set — using insecure dev default. "
        "Set SECRET_KEY env var in production."
    )


def hash_password(plain: str) -> str:
    """Hash a plaintext password with bcrypt."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


# ALEX-TD-229: pre-computed dummy hash for constant-time login path.
# When a user is not found, we still run verify_password(submitted_password, DUMMY_HASH)
# to ensure the response time is indistinguishable from a real failed login.
# Without this, `not user or not verify_password(...)` short-circuits when user=None,
# returning in ~1ms vs ~100ms for bcrypt — leaking whether an email is registered.
# bcrypt.hashpw is called once at import time (module-level) so it has no runtime cost per request.
DUMMY_HASH: str = bcrypt.hashpw(b"dummy-constant-time-password", bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Check a plaintext password against its bcrypt hash."""
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(subject: str) -> str:
    """Create a signed JWT access token with expiry."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> str:
    """Decode and validate a JWT. Returns subject (user id). Raises on invalid."""
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    return payload["sub"]
