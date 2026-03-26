"""ALEX-TD-266: Add index on agent_library.use_count for ORDER BY use_count DESC popularity queries

Revision ID: 0019
Revises: 0018
Create Date: 2026-03-26
"""
import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_agent_library_use_count",
        "agent_library",
        ["use_count"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_agent_library_use_count", table_name="agent_library")
