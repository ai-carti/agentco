"""ALEX-TD-269: add owner_id to agent_library for audit trail.

Library entries were anonymous — no way to query "my library" or audit saves.
Adds owner_id (nullable, indexed) column.

Revision ID: 0020
Revises: 0019
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("agent_library") as batch_op:
        batch_op.add_column(
            sa.Column("owner_id", sa.Text(), nullable=True)
        )
        batch_op.create_index("ix_agent_library_owner_id", ["owner_id"])


def downgrade() -> None:
    with op.batch_alter_table("agent_library") as batch_op:
        batch_op.drop_index("ix_agent_library_owner_id")
        batch_op.drop_column("owner_id")
