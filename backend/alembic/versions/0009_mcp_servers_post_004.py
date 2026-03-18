"""mcp_servers table — POST-004: MCP tools foundation

Revision ID: 0009
Revises: 0008
Create Date: 2026-03-18 05:12:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mcp_servers",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("agent_id", sa.Text, sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("server_url", sa.Text, nullable=False),
        sa.Column("transport", sa.Text, nullable=False, server_default="sse"),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("mcp_servers")
