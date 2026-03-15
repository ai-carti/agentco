"""runs API — M2-004: add agent_id, result, error columns

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-15 12:30:00.000000

Notes:
    Adds agent_id, result, error columns to runs table.
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("runs") as batch_op:
        batch_op.add_column(sa.Column("agent_id", sa.Text, nullable=True))
        batch_op.add_column(sa.Column("result", sa.Text, nullable=True))
        batch_op.add_column(sa.Column("error", sa.Text, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("runs") as batch_op:
        batch_op.drop_column("error")
        batch_op.drop_column("result")
        batch_op.drop_column("agent_id")
