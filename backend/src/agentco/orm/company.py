import uuid
from datetime import datetime
from sqlalchemy import Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class CompanyORM(Base):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # ALEX-TD-095: index on owner_id — every auth'd API call filters by owner_id
    owner_id: Mapped[str | None] = mapped_column(Text, ForeignKey("users.id"), nullable=True, index=True)

    agents: Mapped[list["AgentORM"]] = relationship(back_populates="company", cascade="all, delete-orphan")  # noqa: F821
    tasks: Mapped[list["TaskORM"]] = relationship(back_populates="company", cascade="all, delete-orphan")  # noqa: F821
    credentials: Mapped[list["CredentialORM"]] = relationship(back_populates="company", cascade="all, delete-orphan")  # noqa: F821
