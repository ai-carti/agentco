"""ORM model for User."""
from sqlalchemy import Column, Text, DateTime
from sqlalchemy.sql import func
from .base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Text, primary_key=True)
    email = Column(Text, nullable=False, unique=True)
    hashed_password = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
