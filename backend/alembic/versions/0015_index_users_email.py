"""ALEX-TD-230: add explicit named index ix_users_email on users.email

Previously unique=True created an unnamed implicit index in SQLite.
This migration adds ix_users_email for:
- Consistent naming convention (all FK/search columns have named indexes)
- Postgres: explicit B-tree index with predictable name for EXPLAIN ANALYZE
- Forward-compat: avoids silent schema drift when migrating from SQLite → Postgres

Revision ID: 0015
Revises: 0014
Create Date: 2026-03-26
"""
from alembic import op
from sqlalchemy import inspect

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # Check if index already exists to be idempotent (SQLite unique=True may have
    # created an unnamed index; named version is safe to add alongside it)
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("users")}
    if "ix_users_email" not in existing_indexes:
        op.create_index("ix_users_email", "users", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_email", table_name="users")
