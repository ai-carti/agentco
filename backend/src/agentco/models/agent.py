from datetime import datetime
from pydantic import BaseModel, Field
import uuid


class Agent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    name: str
    role: str | None = None
    system_prompt: str | None = None
    model: str = "gpt-4o-mini"
    library_agent_id: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"frozen": True}
