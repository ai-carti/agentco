import uuid
from datetime import datetime
from sqlalchemy import Text, DateTime, Integer, func
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
    # ALEX-TD-266: index=True for future ORDER BY use_count DESC (popularity ranking) queries
    use_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    # ALEX-TD-119: index on created_at — used in ORDER BY created_at DESC in GET /api/library
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    # ALEX-TD-269: track who saved the agent for audit trail and future "My Library" filtering.
    # nullable=True for backward compat with existing rows (pre-migration entries have no owner).
    # Index on owner_id for future "GET /api/library?mine=true" queries.
    owner_id: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
