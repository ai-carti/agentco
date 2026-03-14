from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db.session import get_session
from ..services.task import TaskService, InvalidTransitionError
from ..repositories.base import NotFoundError
from ..auth.dependencies import get_current_user
from ..orm.user import User

router = APIRouter(
    prefix="/api/companies/{company_id}/agents/{agent_id}/tasks",
    tags=["tasks"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str
    description: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


class TaskStatusUpdate(BaseModel):
    status: str


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
def create_task(
    company_id: str,
    agent_id: str,
    body: TaskCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
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
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        return TaskService(session).list_by_agent(
            company_id=company_id,
            agent_id=agent_id,
            owner_id=current_user.id,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{task_id}", response_model=TaskOut)
def get_task(
    company_id: str,
    agent_id: str,
    task_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
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
def update_task(
    company_id: str,
    agent_id: str,
    task_id: str,
    body: TaskUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
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
def update_task_status(
    company_id: str,
    agent_id: str,
    task_id: str,
    body: TaskStatusUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
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
def delete_task(
    company_id: str,
    agent_id: str,
    task_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
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
