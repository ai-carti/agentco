"""
Runs API — M2-004.

Endpoints:
    POST  /api/companies/{company_id}/runs                  → create run with goal
    GET   /api/companies/{company_id}/runs                  → list runs
    GET   /api/companies/{company_id}/runs/{run_id}         → run details (+ events_count)
    PATCH /api/companies/{company_id}/runs/{run_id}/stop    → stop run (+ POST backward compat)
    GET   /api/companies/{company_id}/runs/{run_id}/events  → list run events
    POST  /api/companies/{company_id}/tasks/{task_id}/run   → legacy: run from task (rate limited)
"""
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..db.session import get_session, SessionLocal
from ..services.run import RunService
from ..repositories.base import NotFoundError, ConflictError
from ..auth.dependencies import get_current_user
from ..orm.user import UserORM
from ..core.rate_limiting import limiter

# Rate limit config from env (ALEX-POST-003 AC: RATE_LIMIT_RUN env var)
_RATE_LIMIT_RUN = os.getenv("RATE_LIMIT_RUN", "10/minute")
# ALEX-TD-065: separate limit for POST /runs (goal-based runs without task, still can trigger LLM)
_RATE_LIMIT_CREATE_RUN = os.getenv("RATE_LIMIT_CREATE_RUN", "20/minute")

router = APIRouter(
    prefix="/api/companies/{company_id}",
    tags=["runs"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────

class RunCreate(BaseModel):
    # ALEX-TD-051: max_length=10000 prevents megabyte goals → LLM cost abuse
    goal: str = Field(min_length=1, max_length=10000)

    @field_validator("goal", mode="before")
    @classmethod
    def strip_goal(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip()
        return v


class RunOut(BaseModel):
    id: str
    company_id: str
    goal: Optional[str] = None
    task_id: Optional[str] = None
    agent_id: Optional[str] = None
    status: str
    total_cost_usd: float = 0.0
    total_tokens: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    result: Optional[str] = None
    error: Optional[str] = None

    model_config = {"from_attributes": True}


class RunDetailOut(RunOut):
    events_count: int = 0


class RunEventOut(BaseModel):
    id: str
    run_id: str
    agent_id: Optional[str] = None
    task_id: Optional[str] = None
    event_type: str
    payload: Optional[str] = None
    created_at: Optional[datetime] = None


class RunCreatedOut(BaseModel):
    run_id: str


# ── Session factory for background tasks ──────────────────────────────────────

def _session_ctx() -> "Session":
    """
    ALEX-TD-025 fix: plain session factory (не contextmanager).

    Возвращает свежую Session. Вызывающий код обязан вызвать session.close()
    в finally-блоке. Используется в RunService.execute_run() как session_factory.

    Было: @contextmanager + yield → session_factory() возвращал
    _GeneratorContextManager, не Session → AttributeError при .get()/.commit().
    Стало: обычная функция → session_factory() возвращает Session напрямую.
    """
    return SessionLocal()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/runs",
    response_model=RunOut,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(_RATE_LIMIT_CREATE_RUN)
async def create_run(
    request: Request,
    company_id: str,
    body: RunCreate,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Create a run with a goal and start it as a background task.

    ALEX-TD-126: passes session_factory so the background execute_run() task
    can open a fresh DB session (avoids detached-instance errors in async context).
    """
    try:
        run = RunService(session).create_with_goal(
            company_id=company_id,
            goal=body.goal,
            owner_id=current_user.id,
            session_factory=_session_ctx,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return RunOut(**run.model_dump())


# ALEX-TD-107 fix: "error" is a valid terminal status (loop_detected/cost_limit_exceeded).
# Previously missing → GET /runs?status=error returned 422. ALEX-TD-111: regression fix.
VALID_RUN_STATUSES = {"pending", "running", "completed", "failed", "stopped", "done", "error"}


@router.get("/runs", response_model=list[RunOut])
async def list_runs(
    company_id: str,
    limit: int = Query(default=20, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Список ранов компании с пагинацией. Опциональный фильтр по статусу: ?status=running"""
    if status_filter is not None and status_filter not in VALID_RUN_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status '{status_filter}'. Valid values: {sorted(VALID_RUN_STATUSES)}",
        )
    try:
        runs = RunService(session).list_by_company_owned(
            company_id,
            owner_id=current_user.id,
            limit=limit,
            offset=offset,
            status_filter=status_filter,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")
    return [RunOut(**r.model_dump()) for r in runs]


@router.get("/runs/{run_id}", response_model=RunDetailOut)
async def get_run(
    company_id: str,
    run_id: str,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Run details with events count."""
    try:
        detail = RunService(session).get_detail(
            company_id=company_id, run_id=run_id, owner_id=current_user.id,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunDetailOut(**detail)


async def _do_stop_run(company_id: str, run_id: str, session: Session, current_user: UserORM) -> RunOut:
    """Shared stop logic for both POST and PATCH."""
    try:
        run = RunService(session).stop(
            company_id=company_id, run_id=run_id, owner_id=current_user.id,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunOut(**run.model_dump())


@router.patch("/runs/{run_id}/stop", response_model=RunOut)
async def patch_stop_run(
    company_id: str,
    run_id: str,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Stop a running run (PATCH — per M2-004 spec)."""
    return await _do_stop_run(company_id, run_id, session, current_user)


@router.post("/runs/{run_id}/stop", response_model=RunOut)
async def stop_run(
    company_id: str,
    run_id: str,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Stop a running run (POST — backward compat)."""
    return await _do_stop_run(company_id, run_id, session, current_user)


@router.get("/runs/{run_id}/events", response_model=list[RunEventOut])
async def list_run_events(
    company_id: str,
    run_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """List events for a run with pagination (default limit=100, max=1000)."""
    try:
        events = RunService(session).list_events(
            company_id=company_id, run_id=run_id, owner_id=current_user.id,
            limit=limit, offset=offset,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Run not found")
    return [RunEventOut(**e.model_dump()) for e in events]


@router.post(
    "/tasks/{task_id}/run",
    response_model=RunCreatedOut,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(_RATE_LIMIT_RUN)
async def run_task(
    request: Request,
    company_id: str,
    task_id: str,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Создаёт Run для задачи и запускает агента в background."""
    try:
        run = RunService(session).create_and_start(
            company_id=company_id,
            task_id=task_id,
            owner_id=current_user.id,
            session_factory=_session_ctx,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ConflictError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    return RunCreatedOut(run_id=run.id)


@router.get("/tasks/{task_id}/runs", response_model=list[RunOut])
async def list_task_runs(
    company_id: str,
    task_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Список ранов задачи с пагинацией (ALEX-TD-043: default limit=50, max=500)."""
    try:
        runs = RunService(session).list_by_task_owned(
            company_id=company_id,
            task_id=task_id,
            owner_id=current_user.id,
            limit=limit,
            offset=offset,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return [RunOut(**r.model_dump()) for r in runs]


@router.get("/tasks/{task_id}/runs/{run_id}", response_model=RunDetailOut)
async def get_task_run(
    company_id: str,
    task_id: str,
    run_id: str,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    """Детали рана задачи."""
    try:
        detail = RunService(session).get_task_run_detail(
            company_id=company_id,
            task_id=task_id,
            run_id=run_id,
            owner_id=current_user.id,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunDetailOut(**detail)
