"""ALEX-TD-248, ALEX-TD-250: fix run_events indexes

ALEX-TD-248: drop redundant standalone ix_run_events_run_id.
  The compound index ix_run_events_run_created (run_id, created_at) has run_id
  as its leading column, covering all WHERE run_id = ? queries. The single-column
  index was redundant and slowed every INSERT during event streaming.

ALEX-TD-250: add indexes on run_events.agent_id and run_events.task_id.
  These fields had no indexes, making analytics queries ("all events for agent X")
  do a full table scan.

Revision ID: 0017
Revises: 0016
Create Date: 2026-03-26
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # Guard: run_events table may not exist in all migration paths
    # (it can be created via ORM create_all rather than migrations).
    # This mirrors the same pattern used in migration 0010.
    if "run_events" not in existing_tables:
        return

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("run_events")}

    # ALEX-TD-248: drop the redundant standalone single-column index on run_id
    if "ix_run_events_run_id" in existing_indexes:
        op.drop_index("ix_run_events_run_id", table_name="run_events")

    # ALEX-TD-250: add indexes on agent_id and task_id
    if "ix_run_events_agent_id" not in existing_indexes:
        op.create_index("ix_run_events_agent_id", "run_events", ["agent_id"])

    if "ix_run_events_task_id" not in existing_indexes:
        op.create_index("ix_run_events_task_id", "run_events", ["task_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "run_events" not in existing_tables:
        return

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("run_events")}

    # Restore standalone run_id index (ALEX-TD-248 rollback)
    if "ix_run_events_run_id" not in existing_indexes:
        op.create_index("ix_run_events_run_id", "run_events", ["run_id"])

    # Drop ALEX-TD-250 indexes
    if "ix_run_events_agent_id" in existing_indexes:
        op.drop_index("ix_run_events_agent_id", table_name="run_events")

    if "ix_run_events_task_id" in existing_indexes:
        op.drop_index("ix_run_events_task_id", table_name="run_events")
