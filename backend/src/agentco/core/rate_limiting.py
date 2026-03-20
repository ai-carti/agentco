"""
Rate limiting configuration (ALEX-POST-003).

Provides a module-level Limiter instance to avoid circular imports.
Import this in handlers instead of importing from main.py.

Usage in handler:
    from ..core.rate_limiting import limiter

    @router.post("/foo")
    @limiter.limit("10/minute")
    async def my_endpoint(request: Request, ...):
        ...

main.py registers the limiter on app.state and exception handler.
"""
import os

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address


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
        except Exception:
            pass
    return get_remote_address(request)


# Global Limiter — shared across all handlers
limiter = Limiter(key_func=_get_rate_limit_key)


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
