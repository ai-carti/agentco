from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional
import uuid


class Run(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    task_id: str
    agent_id: Optional[str] = None
    status: str = "pending"  # pending | running | done | failed | stopped
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    cost_usd: float = 0.0
    result: Optional[str] = None
    error: Optional[str] = None

    model_config = {"frozen": True}
