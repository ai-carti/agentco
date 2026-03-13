from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import os

from .handlers import companies_router, agents_router, tasks_router

app = FastAPI(title="AgentCo", version="0.1.0")

app.include_router(companies_router)
app.include_router(agents_router)
app.include_router(tasks_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


# Mount built frontend static files (must be last — catch-all)
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
