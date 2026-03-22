"""ALEX-TD-095: add index on companies.owner_id for performance

Revision ID: 0013
Revises: 0012
Create Date: 2026-03-22

Every auth'd API call (list_companies, create_agent, create_run, etc.)
filters companies by owner_id. Without an index, this is a full table scan.
"""
from alembic import op
from sqlalchemy import inspect

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    # Check if index already exists (idempotent for existing DBs)
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("companies")}
    if "ix_companies_owner_id" not in existing_indexes:
        op.create_index("ix_companies_owner_id", "companies", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_companies_owner_id", table_name="companies")
