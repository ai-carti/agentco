"""
middleware/correlation.py — Correlation ID middleware for request tracing.

Adds X-Correlation-ID header to every response.
"""
from __future__ import annotations

import uuid
from contextvars import ContextVar

import structlog.contextvars
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

correlation_id_ctx: ContextVar[str] = ContextVar("correlation_id", default="")


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Adds X-Correlation-ID to every response and stores it in context."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Use incoming header if provided, otherwise generate new UUID
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        token = correlation_id_ctx.set(correlation_id)
        # ALEX-TD-273: bind correlation_id to structlog contextvars so it appears in
        # every structured JSON log line for this request. clear_contextvars() first
        # to prevent leaking context between requests in async event loop.
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=correlation_id)
        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = correlation_id
            return response
        finally:
            correlation_id_ctx.reset(token)
            structlog.contextvars.clear_contextvars()
