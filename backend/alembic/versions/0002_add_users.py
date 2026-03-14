"""add users table

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-14 09:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("email", sa.Text, nullable=False, unique=True),
        sa.Column("hashed_password", sa.Text, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )


def downgrade() -> None:
    op.drop_table("users")
