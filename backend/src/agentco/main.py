from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os

from .handlers import companies_router, agents_router, tasks_router, auth_router, credentials_router, runs_router, ws_events_router

app = FastAPI(title="AgentCo", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://localhost:3000"],
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


# AC2: GET /health → {"status": "ok"}
@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/health")
async def health():
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
