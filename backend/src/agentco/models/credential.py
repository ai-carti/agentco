from datetime import datetime
from pydantic import BaseModel, Field
import uuid


class Credential(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    provider: str
    encrypted_api_key: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"frozen": True}
