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
    # ALEX-TD-258: nullable=False — every company must have an owner; nullable allowed orphan
    # companies that would silently fail all ownership checks (owner_id != user_id always False for NULL)
    owner_id: Mapped[str] = mapped_column(Text, ForeignKey("users.id"), nullable=False, index=True)

    agents: Mapped[list["AgentORM"]] = relationship(back_populates="company", cascade="all, delete-orphan")  # noqa: F821
    tasks: Mapped[list["TaskORM"]] = relationship(back_populates="company", cascade="all, delete-orphan")  # noqa: F821
    credentials: Mapped[list["CredentialORM"]] = relationship(back_populates="company", cascade="all, delete-orphan")  # noqa: F821
