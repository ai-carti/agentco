import os

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from ..db.session import get_session
from ..services.task import TaskService, InvalidTransitionError
from ..repositories.base import NotFoundError
from ..auth.dependencies import get_current_user
from ..orm.user import UserORM
from ..models.task import TaskStatus
from ..core.rate_limiting import limiter

# ALEX-TD-122: rate limits for task mutable endpoints
_RATE_LIMIT_TASKS_CREATE = os.getenv("RATE_LIMIT_TASKS_CREATE", "60/minute")
_RATE_LIMIT_TASKS_MUTATE = os.getenv("RATE_LIMIT_TASKS_MUTATE", "120/minute")

router = APIRouter(
    prefix="/api/companies/{company_id}/agents/{agent_id}/tasks",
    tags=["tasks"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    # ALEX-TD-072: max_length=500 prevents oversized titles hitting DB/LLM
    title: str = Field(..., min_length=1, max_length=500)
    # ALEX-TD-072: max_length=5000 for description
    description: str | None = Field(default=None, max_length=5000)

    @field_validator("title")
    @classmethod
    def title_must_not_be_whitespace(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("title must not be empty or whitespace-only")
        return stripped


class TaskUpdate(BaseModel):
    # ALEX-TD-072: max_length mirrors TaskCreate
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=5000)

    @field_validator("title")
    @classmethod
    def title_must_not_be_whitespace(cls, v: str | None) -> str | None:
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("title must not be empty or whitespace-only")
        return stripped


class TaskStatusUpdate(BaseModel):
    # ALEX-TD-073: use TaskStatus Literal instead of bare str — validates at API boundary
    # before reaching service layer FSM check
    status: TaskStatus


class TaskOut(BaseModel):
    id: str
    company_id: str
    agent_id: str | None
    title: str
    description: str | None
    status: str

    model_config = {"from_attributes": True}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(_RATE_LIMIT_TASKS_CREATE)
def create_task(
    request: Request,
    company_id: str,
    agent_id: str,
    body: TaskCreate,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    try:
        return TaskService(session).create(
            company_id=company_id,
            agent_id=agent_id,
            owner_id=current_user.id,
            **body.model_dump(),
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("", response_model=list[TaskOut])
def list_tasks(
    company_id: str,
    agent_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    try:
        return TaskService(session).list_by_agent(
            company_id=company_id,
            agent_id=agent_id,
            owner_id=current_user.id,
            limit=limit,
            offset=offset,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{task_id}", response_model=TaskOut)
def get_task(
    company_id: str,
    agent_id: str,
    task_id: str,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    try:
        return TaskService(session).get(
            company_id=company_id,
            agent_id=agent_id,
            task_id=task_id,
            owner_id=current_user.id,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Task not found")


@router.put("/{task_id}", response_model=TaskOut)
@limiter.limit(_RATE_LIMIT_TASKS_MUTATE)
def update_task(
    request: Request,
    company_id: str,
    agent_id: str,
    task_id: str,
    body: TaskUpdate,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    try:
        return TaskService(session).update(
            company_id=company_id,
            agent_id=agent_id,
            task_id=task_id,
            owner_id=current_user.id,
            **body.model_dump(exclude_none=True),
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Task not found")


@router.patch("/{task_id}/status", response_model=TaskOut)
@limiter.limit(_RATE_LIMIT_TASKS_MUTATE)
def update_task_status(
    request: Request,
    company_id: str,
    agent_id: str,
    task_id: str,
    body: TaskStatusUpdate,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    try:
        return TaskService(session).update_status(
            company_id=company_id,
            agent_id=agent_id,
            task_id=task_id,
            owner_id=current_user.id,
            new_status=body.status,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Task not found")
    except InvalidTransitionError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(_RATE_LIMIT_TASKS_MUTATE)
def delete_task(
    request: Request,
    company_id: str,
    agent_id: str,
    task_id: str,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    try:
        TaskService(session).delete(
            company_id=company_id,
            agent_id=agent_id,
            task_id=task_id,
            owner_id=current_user.id,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Task not found")
