import uuid
from datetime import datetime
from sqlalchemy import Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class TaskORM(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    # ALEX-TD-004 fix: index on FK columns used in WHERE filters
    company_id: Mapped[str] = mapped_column(Text, ForeignKey("companies.id"), nullable=False, index=True)
    agent_id: Mapped[str | None] = mapped_column(Text, ForeignKey("agents.id"), index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="todo")
    result: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    company: Mapped["CompanyORM"] = relationship(back_populates="tasks")  # noqa: F821
    agent: Mapped["AgentORM | None"] = relationship(back_populates="tasks")  # noqa: F821
    runs: Mapped[list["RunORM"]] = relationship(back_populates="task")  # noqa: F821
