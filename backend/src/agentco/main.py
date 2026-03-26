from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging
import os

# ALEX-TD-228: activate structured logging (structlog JSON) at startup.
# setup_logging() was defined in logging_config.py but never called — in production
# all logs fell back to stdlib plain-text format, defeating ALEX-POST-004 structlog setup.
from .logging_config import setup_logging
setup_logging(level=os.getenv("LOG_LEVEL", "INFO"))

from slowapi.errors import RateLimitExceeded

from .core.rate_limiting import limiter, rate_limit_exceeded_handler
from .middleware.correlation import CorrelationIdMiddleware
from .handlers import companies_router, agents_router, tasks_router, auth_router, credentials_router, runs_router, ws_events_router, templates_router, memory_router, library_router, mcp_servers_router

logger = logging.getLogger(__name__)

# ALEX-TD-001 fix: CORS origins from env — critical for prod deployment
# ALEX-TD-224 fix: warn when CORS_ORIGINS is not set in production.
# Previously _DEFAULT_CORS_ORIGINS included localhost:5173/3000 as implicit fallback —
# in a production deployment without CORS_ORIGINS set, dev origins were silently whitelisted.
# Now: log a WARNING so ops teams notice missing CORS config; dev defaults still apply
# for local development convenience but the warning makes it diagnosable.
_DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:3000"
_cors_origins_env = os.getenv("CORS_ORIGINS")
if _cors_origins_env is None:
    logger.warning(
        "CORS_ORIGINS env var is not set — using localhost dev defaults. "
        "In production, set CORS_ORIGINS to your frontend URL(s) to restrict cross-origin access."
    )
_cors_origins_raw = _cors_origins_env or _DEFAULT_CORS_ORIGINS
_cors_origins = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]


# ALEX-TD-003 fix: graceful shutdown — cancel all running background tasks on SIGTERM
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ALEX-TD-125: auto-create tables only for SQLite (dev/default fallback).
    # For Postgres, always use `alembic upgrade head` — create_all bypasses migrations
    # and can cause schema drift when Alembic adds columns the ORM already knows about.
    from .orm import Base
    from .db.session import engine, _DB_URL, _is_postgres
    if not _is_postgres(_DB_URL):
        Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: cancel any still-running agent background tasks
    from .services.run import RunService
    active = list(RunService._active_tasks.values())
    if active:
        logger.info("Graceful shutdown: cancelling %d active run task(s)", len(active))
        for task in active:
            if not task.done():
                task.cancel()
        await asyncio.gather(*active, return_exceptions=True)
    logger.info("Shutdown complete")


app = FastAPI(title="AgentCo", version="0.1.0", lifespan=lifespan)

# Rate limiting setup (ALEX-POST-003)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(companies_router)
app.include_router(agents_router)
app.include_router(tasks_router)
app.include_router(credentials_router)
app.include_router(runs_router)
app.include_router(ws_events_router)
app.include_router(templates_router)
app.include_router(memory_router)
app.include_router(library_router)
app.include_router(mcp_servers_router)

# ALEX-POST-006: API versioning — mount all routers also under /api/v1/ prefix
# Existing /api/... paths remain unchanged for backward compat.
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse

class ApiV1AliasMiddleware(BaseHTTPMiddleware):
    """Transparently re-maps /api/v1/{rest} → /api/{rest} for backward compat.

    BUG-041: double v1 prefix /api/v1/v1/X → return 400 Bad Request.
    BUG-042: old /api/... paths (backward compat, 200) get Deprecation header.
    """
    async def dispatch(self, request, call_next):
        from starlette.responses import Response as StarletteResponse
        import json

        path = request.url.path

        # BUG-041: detect double v1 prefix — /api/v1/v1/...
        if path.startswith("/api/v1/v1/"):
            return StarletteResponse(
                content=json.dumps({
                    "detail": "Bad Request: malformed path — double /v1/ prefix detected. "
                              "Use /api/v1/{resource} or /api/{resource}."
                }),
                status_code=400,
                media_type="application/json",
            )

        is_old_api_path = False
        if path.startswith("/api/v1/") and path != "/api/v1/":
            # Rewrite scope path for internal routing (no external redirect)
            new_path = "/api/" + path[len("/api/v1/"):]
            request.scope["path"] = new_path
            request.scope["raw_path"] = new_path.encode()
            # ALEX-TD-049: reset path_params so stale values from outer ASGI layers
            # (proxy middleware, gateways, etc.) don't leak into route handlers.
            # The router will re-derive path_params from the new path during matching.
            request.scope["path_params"] = {}
        elif path.startswith("/api/") and not path.startswith("/api/v1/"):
            # Old /api/... path — mark for Deprecation header (BUG-042)
            is_old_api_path = True

        response = await call_next(request)

        # BUG-042: add Deprecation header to old /api/... 200 responses
        if is_old_api_path and response.status_code == 200:
            response.headers["Deprecation"] = "true"
            response.headers["Link"] = '</api/v1/>; rel="successor-version"'

        return response

app.add_middleware(ApiV1AliasMiddleware)


# AC2: GET /health → {"status": "ok"} (with DB liveness check — ALEX-TD-052)
# ALEX-TD-198: rate-limited to prevent DB spam from load balancers / monitoring
@app.get("/health")
@limiter.limit("120/minute")
async def health_check(request: Request):
    """Liveness probe for Railway. Checks DB connectivity so Railway restarts on DB failure."""
    from sqlalchemy import text
    from .db.session import SessionLocal
    try:
        session = SessionLocal()
        try:
            session.execute(text("SELECT 1"))
        finally:
            session.close()
    except Exception as e:
        from fastapi import Response
        import json
        return Response(
            content=json.dumps({"status": "error", "detail": "db_unreachable"}),
            status_code=503,
            media_type="application/json",
        )
    return {"status": "ok"}


# ALEX-TD-198: rate-limited to prevent DB spam from load balancers / monitoring
@app.get("/api/health")
@limiter.limit("120/minute")
async def health(request: Request):
    return {"status": "ok", "version": "0.1.0"}


# AC4: GET /api/v1/ → base router stub
@app.get("/api/v1/")
async def api_v1_root():
    return {"version": "v1", "status": "ok"}


# AC3: Mount built Next.js static.
# Priority: frontend/out/ (dev layout) → bundled static/
_repo_root = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")
)
_frontend_out = os.path.join(_repo_root, "frontend", "out")
_bundled_static = os.path.join(os.path.dirname(__file__), "static")

static_dir = _frontend_out if os.path.exists(_frontend_out) else _bundled_static
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
