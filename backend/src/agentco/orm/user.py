"""ORM model for User."""
from sqlalchemy import Column, Index, Text, DateTime, Boolean
from sqlalchemy.sql import func
from .base import Base


class UserORM(Base):
    __tablename__ = "users"

    # ALEX-TD-230: explicit named index on email for consistent naming across codebase.
    # unique=True creates an implicit unnamed index in SQLite, but Postgres requires an
    # explicit Index for predictable naming + EXPLAIN ANALYZE visibility.
    __table_args__ = (
        Index("ix_users_email", "email", unique=True),
    )

    id = Column(Text, primary_key=True)
    email = Column(Text, nullable=False, unique=True)
    hashed_password = Column(Text, nullable=False)
    has_completed_onboarding = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime, server_default=func.now())
