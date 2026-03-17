import uuid
from sqlalchemy import Text, Integer, func, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class AgentLibraryORM(Base):
    __tablename__ = "agent_library"

    id: Mapped[str] = mapped_column(
        Text, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str | None] = mapped_column(Text)
    system_prompt: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text, default="gpt-4o-mini")
    use_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(
        DateTime, server_default=func.now()
    )
