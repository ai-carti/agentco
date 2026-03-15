"""
Runs API — M2-004.

Endpoints:
    POST  /api/companies/{company_id}/tasks/{task_id}/run  → run_id
    GET   /api/companies/{company_id}/runs                 → list
    GET   /api/companies/{company_id}/runs/{run_id}        → Run
    POST  /api/companies/{company_id}/runs/{run_id}/stop   → Run
"""
from contextlib import contextmanager
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.session import get_session, SessionLocal
from ..services.run import RunService
from ..repositories.base import NotFoundError, ConflictError
from ..auth.dependencies import get_current_user
from ..orm.user import User

router = APIRouter(
    prefix="/api/companies/{company_id}",
    tags=["runs"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────

class RunOut(BaseModel):
    id: str
    company_id: str
    task_id: str
    agent_id: Optional[str]
    status: str
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    result: Optional[str]
    error: Optional[str]

    model_config = {"from_attributes": True}


class RunCreatedOut(BaseModel):
    run_id: str


# ── Session factory for background tasks ──────────────────────────────────────

@contextmanager
def _session_ctx():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/tasks/{task_id}/run",
    response_model=RunCreatedOut,
    status_code=status.HTTP_201_CREATED,
)
async def run_task(
    company_id: str,
    task_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Создаёт Run и запускает агента в background."""
    try:
        run = RunService(session).create_and_start(
            company_id=company_id,
            task_id=task_id,
            session_factory=_session_ctx,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ConflictError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return RunCreatedOut(run_id=run.id)


@router.get("/runs", response_model=list[RunOut])
async def list_runs(
    company_id: str,
    limit: int = 100,
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Список ранов компании с пагинацией."""
    runs = RunService(session).list_by_company(company_id, limit=limit, offset=offset)
    return [RunOut(**r.model_dump()) for r in runs]


@router.get("/runs/{run_id}", response_model=RunOut)
async def get_run(
    company_id: str,
    run_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Статус и результат рана."""
    try:
        run = RunService(session).get(company_id=company_id, run_id=run_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunOut(**run.model_dump())


@router.post("/runs/{run_id}/stop", response_model=RunOut)
async def stop_run(
    company_id: str,
    run_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Останавливает running ран."""
    try:
        run = RunService(session).stop(company_id=company_id, run_id=run_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunOut(**run.model_dump())
