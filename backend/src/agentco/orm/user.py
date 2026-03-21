"""ORM model for User."""
from sqlalchemy import Column, Text, DateTime, Boolean
from sqlalchemy.sql import func
from .base import Base


class UserORM(Base):
    __tablename__ = "users"

    id = Column(Text, primary_key=True)
    email = Column(Text, nullable=False, unique=True)
    hashed_password = Column(Text, nullable=False)
    has_completed_onboarding = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime, server_default=func.now())
