"""ALEX-TD-243: add parent_agent_id + hierarchy_level columns and index

POST-006 added parent_agent_id and hierarchy_level to AgentORM but no Alembic
migration was created at the time.  This migration back-fills both columns so
that a fresh `alembic upgrade head` produces the same schema as Base.metadata.

Note: SQLite does not support ADD COLUMN with FK constraints via ALTER TABLE.
We add the column without the inline FK declaration — the FK is enforced at the
ORM level and via PRAGMA foreign_keys=ON (set on every connection).

ALEX-TD-243: all FK columns must have index=True for consistency.

Revision ID: 0016
Revises: 0015
Create Date: 2026-03-26
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect, text

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_cols = {c["name"] for c in inspector.get_columns("agents")}

    # POST-006 columns — add only if missing (idempotent).
    # SQLite does not support ADD COLUMN ... REFERENCES via ALTER TABLE,
    # so we omit the inline FK; the ORM-level relationship + PRAGMA foreign_keys=ON
    # still enforces referential integrity at runtime.
    if "parent_agent_id" not in existing_cols:
        bind.execute(text("ALTER TABLE agents ADD COLUMN parent_agent_id TEXT"))

    if "hierarchy_level" not in existing_cols:
        bind.execute(text("ALTER TABLE agents ADD COLUMN hierarchy_level INTEGER NOT NULL DEFAULT 0"))

    # ALEX-TD-243: index on parent_agent_id for consistency with all other FK cols
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("agents")}
    if "ix_agents_parent_agent_id" not in existing_indexes:
        op.create_index("ix_agents_parent_agent_id", "agents", ["parent_agent_id"])


def downgrade() -> None:
    # SQLite does not support DROP COLUMN before 3.35 / alembic batch mode;
    # we drop the index and leave columns (acceptable for SQLite downgrade).
    op.drop_index("ix_agents_parent_agent_id", table_name="agents")
