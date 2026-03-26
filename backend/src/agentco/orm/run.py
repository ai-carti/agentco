import uuid
from datetime import datetime, timezone
from sqlalchemy import Text, DateTime, Float, Integer, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class RunORM(Base):
    __tablename__ = "runs"

    # ALEX-TD-117: compound indexes for filtered queries (company_id + status, company_id + started_at)
    __table_args__ = (
        Index("ix_runs_company_status", "company_id", "status"),
        Index("ix_runs_company_started", "company_id", "started_at"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    # ALEX-TD-004 fix: index on FK columns for list_by_company / find_active_by_task queries
    company_id: Mapped[str] = mapped_column(Text, ForeignKey("companies.id"), nullable=False, index=True)
    goal: Mapped[str | None] = mapped_column(Text)
    task_id: Mapped[str | None] = mapped_column(Text, ForeignKey("tasks.id"), index=True)
    agent_id: Mapped[str | None] = mapped_column(Text, ForeignKey("agents.id"), index=True)
    status: Mapped[str] = mapped_column(Text, default="pending")
    total_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    result: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)

    task: Mapped["TaskORM"] = relationship(back_populates="runs")  # noqa: F821
    events: Mapped[list["RunEventORM"]] = relationship(back_populates="run", cascade="all, delete-orphan")


class RunEventORM(Base):
    __tablename__ = "run_events"

    # ALEX-TD-174: compound index (run_id, created_at) for list_events query.
    # list_events does WHERE run_id = ? ORDER BY created_at — without compound index
    # SQLite applies filesort on top of the run_id lookup (expensive for high-volume runs).
    # Leading column run_id enables both the WHERE lookup and the ORDER BY in one index scan.
    __table_args__ = (
        Index("ix_run_events_run_created", "run_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    # ALEX-TD-248: removed index=True — compound ix_run_events_run_created (run_id, created_at)
    # covers all WHERE run_id = ? queries. Standalone ix_run_events_run_id was redundant
    # and slowed INSERTs during streaming.
    run_id: Mapped[str] = mapped_column(Text, ForeignKey("runs.id"), nullable=False)
    # ALEX-TD-250: added index=True for analytics queries ("all events for agent X")
    agent_id: Mapped[str | None] = mapped_column(Text, index=True)
    task_id: Mapped[str | None] = mapped_column(Text, index=True)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    run: Mapped["RunORM"] = relationship(back_populates="events")
