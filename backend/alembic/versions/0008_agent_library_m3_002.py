"""agent_library table — M3-002: Agent Library + Portfolio

Revision ID: 0008
Revises: 0007
Create Date: 2026-03-17 18:00:00.000000

Notes:
    Creates agent_library table and adds library_agent_id to agents.
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_library",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("role", sa.Text, nullable=True),
        sa.Column("system_prompt", sa.Text, nullable=True),
        sa.Column("model", sa.Text, nullable=False, server_default="gpt-4o-mini"),
        sa.Column("use_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    # library_agent_id already exists in agents table (added in 0004), skip


def downgrade() -> None:
    op.drop_table("agent_library")
