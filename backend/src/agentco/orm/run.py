import uuid
from datetime import datetime
from sqlalchemy import Text, DateTime, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class RunORM(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(Text, ForeignKey("companies.id"), nullable=False)
    task_id: Mapped[str] = mapped_column(Text, ForeignKey("tasks.id"), nullable=False)
    agent_id: Mapped[str | None] = mapped_column(Text, ForeignKey("agents.id"))
    status: Mapped[str] = mapped_column(Text, default="pending")
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    result: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)

    task: Mapped["TaskORM"] = relationship(back_populates="runs")  # noqa: F821
