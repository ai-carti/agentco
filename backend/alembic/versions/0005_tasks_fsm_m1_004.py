"""tasks FSM status update — M1-004

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-14 16:20:00.000000

Notes:
    Tasks table already exists from revision 0001.
    This revision updates the default status from 'backlog' to 'todo'
    to match the new FSM: todo → in_progress → done / failed.
    Also changes any existing 'backlog' rows to 'todo'.
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update existing backlog tasks to todo
    op.execute("UPDATE tasks SET status = 'todo' WHERE status = 'backlog'")


def downgrade() -> None:
    op.execute("UPDATE tasks SET status = 'backlog' WHERE status = 'todo'")
