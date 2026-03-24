"""
Rate limiting configuration (ALEX-POST-003, ALEX-POST-012).

Provides a module-level Limiter instance to avoid circular imports.
Import this in handlers instead of importing from main.py.

Usage in handler:
    from ..core.rate_limiting import limiter

    @router.post("/foo")
    @limiter.limit("10/minute")
    async def my_endpoint(request: Request, ...):
        ...

main.py registers the limiter on app.state and exception handler.

ALEX-POST-012: Redis-backed storage for multi-replica Railway deployments.
- If REDIS_URL env var is set → slowapi uses Redis storage (storage_uri=REDIS_URL)
- If REDIS_URL is not set → fallback to in-memory (single-process, resets on restart)
"""
import logging
import os

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)


def _get_rate_limit_key(request: Request) -> str:
    """Rate limit key: user_id from JWT if available, else IP address.

    Using user_id prevents bypass by rotating IPs (ALEX-POST-003 AC).
    Falls back to IP for unauthenticated requests.
    """
    # Lazy import to avoid circular deps at module load time
    from agentco.auth.security import decode_access_token

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            user_id = decode_access_token(token)
            return f"user:{user_id}"
        except Exception as exc:
            # ALEX-TD-183: log unexpected JWT library errors (e.g. API changes after upgrade).
            # Expected pyjwt.PyJWTError (invalid/expired token) falls through here too,
            # which is fine — we degrade to IP-based rate limiting gracefully.
            logger.debug("Unexpected JWT error in _get_rate_limit_key: %s", exc)
    return get_remote_address(request)


def create_limiter(storage_uri: str | None = None) -> Limiter:
    """Create a Limiter instance with optional Redis storage.

    Args:
        storage_uri: Redis URL (e.g. redis://localhost:6379/0) or None for in-memory.

    Returns:
        Configured Limiter instance.
    """
    return Limiter(key_func=_get_rate_limit_key, storage_uri=storage_uri)


def get_limiter_for_env() -> Limiter:
    """Create Limiter based on REDIS_URL environment variable.

    - REDIS_URL set → Redis storage (for multi-replica Railway deployments)
    - REDIS_URL absent → in-memory storage (single-worker fallback)
    """
    redis_url = os.environ.get("REDIS_URL") or None
    return create_limiter(storage_uri=redis_url)


# Global Limiter — shared across all handlers
# ALEX-POST-012: uses Redis when REDIS_URL is set, in-memory otherwise
limiter = get_limiter_for_env()


def rate_limit_exceeded_handler(request: Request, exc) -> JSONResponse:
    """Return 429 with {"error": "rate_limit_exceeded", "retry_after": N}."""
    try:
        retry_after = int(exc.limit.limit.get_expiry())
    except Exception:
        retry_after = 60
    return JSONResponse(
        status_code=429,
        content={"error": "rate_limit_exceeded", "retry_after": retry_after},
        headers={"Retry-After": str(retry_after)},
    )
