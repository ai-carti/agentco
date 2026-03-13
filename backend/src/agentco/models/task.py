from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field
import uuid

TaskStatus = Literal["backlog", "in_progress", "done", "cancelled"]


class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    title: str
    description: str | None = None
    agent_id: str | None = None
    status: TaskStatus = "backlog"
    result: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"frozen": True}
