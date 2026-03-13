from datetime import datetime
from pydantic import BaseModel, Field
import uuid


class Run(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    task_id: str
    status: str = "pending"
    started_at: datetime | None = None
    finished_at: datetime | None = None
    cost_usd: float = 0.0

    model_config = {"frozen": True}
