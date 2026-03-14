from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field
import uuid

TaskStatus = Literal["todo", "in_progress", "done", "failed"]

# FSM transitions: from_status → allowed next statuses
TASK_FSM: dict[str, set[str]] = {
    "todo": {"in_progress"},
    "in_progress": {"done", "failed"},
    "done": set(),
    "failed": set(),
}


class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    title: str
    description: str | None = None
    agent_id: str | None = None
    status: str = "todo"
    result: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"frozen": True}
