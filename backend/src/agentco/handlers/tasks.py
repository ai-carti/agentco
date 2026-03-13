from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db.session import get_session
from ..services.task import TaskService
from ..repositories.base import NotFoundError

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    company_id: str
    title: str
    description: str | None = None
    agent_id: str | None = None

class TaskStatusUpdate(BaseModel):
    status: str

class TaskOut(BaseModel):
    id: str
    company_id: str
    agent_id: str | None
    title: str
    status: str

    model_config = {"from_attributes": True}


@router.post("/", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(body: TaskCreate, session: Session = Depends(get_session)):
    try:
        return TaskService(session).create(**body.model_dump())
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: str, session: Session = Depends(get_session)):
    try:
        return TaskService(session).get(task_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Task not found")


@router.get("/by-company/{company_id}", response_model=list[TaskOut])
def list_tasks(company_id: str, session: Session = Depends(get_session)):
    return TaskService(session).list_by_company(company_id)


@router.patch("/{task_id}/status", response_model=TaskOut)
def update_task_status(task_id: str, body: TaskStatusUpdate,
                       session: Session = Depends(get_session)):
    try:
        return TaskService(session).update_status(task_id, body.status)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Task not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
