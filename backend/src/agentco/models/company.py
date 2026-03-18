from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid


class Company(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    owner_id: str | None = None

    model_config = {"frozen": True}
