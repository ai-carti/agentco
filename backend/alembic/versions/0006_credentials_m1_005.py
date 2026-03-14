"""LLM credentials table — M1-005

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-14 16:25:00.000000

Notes:
    Creates the credentials table for storing encrypted API keys.
    Columns: id, company_id (FK → companies.id), provider, encrypted_api_key, created_at.
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "credentials",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("company_id", sa.Text, sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("provider", sa.Text, nullable=False),
        sa.Column("encrypted_api_key", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("credentials")
