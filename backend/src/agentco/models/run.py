from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional
import uuid


class Run(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    goal: Optional[str] = None
    task_id: Optional[str] = None
    agent_id: Optional[str] = None
    status: str = "pending"  # pending | running | done | failed | stopped
    total_cost_usd: float = 0.0
    total_tokens: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    result: Optional[str] = None
    error: Optional[str] = None

    model_config = {"frozen": True}


class RunEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    run_id: str
    agent_id: Optional[str] = None
    task_id: Optional[str] = None
    event_type: str
    payload: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"frozen": True}
