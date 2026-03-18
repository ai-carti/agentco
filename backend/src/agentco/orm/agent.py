import uuid
from datetime import datetime
from sqlalchemy import Text, DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class AgentORM(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(Text, ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str | None] = mapped_column(Text)
    system_prompt: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text, default="gpt-4o-mini")
    library_agent_id: Mapped[str | None] = mapped_column(Text)
    # POST-006: hierarchical agents support
    parent_agent_id: Mapped[str | None] = mapped_column(Text, ForeignKey("agents.id"), nullable=True)
    hierarchy_level: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    company: Mapped["CompanyORM"] = relationship(back_populates="agents")  # noqa: F821
    tasks: Mapped[list["TaskORM"]] = relationship(back_populates="agent")  # noqa: F821
    # Self-referential hierarchy
    parent: Mapped["AgentORM | None"] = relationship("AgentORM", remote_side="AgentORM.id", back_populates="children")
    children: Mapped[list["AgentORM"]] = relationship("AgentORM", back_populates="parent")
