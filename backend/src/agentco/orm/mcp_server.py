import uuid
from datetime import datetime
from sqlalchemy import Text, DateTime, Boolean, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class MCPServerORM(Base):
    __tablename__ = "mcp_servers"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    # ALEX-TD-060: index on agent_id for fast list_mcp_servers queries
    agent_id: Mapped[str] = mapped_column(Text, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    server_url: Mapped[str] = mapped_column(Text, nullable=False)
    transport: Mapped[str] = mapped_column(Text, nullable=False, default="sse")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # ALEX-TD-257: DB-level uniqueness prevents TOCTOU race on concurrent POSTs
    # with same (agent_id, name). Python-level SELECT check alone is not safe.
    __table_args__ = (
        UniqueConstraint("agent_id", "name", name="uq_mcp_servers_agent_name"),
    )
