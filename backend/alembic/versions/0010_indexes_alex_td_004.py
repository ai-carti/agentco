"""ALEX-TD-004: add indexes on FK columns for performance

Revision ID: 0010
Revises: 0009
Create Date: 2026-03-18

Note: run_events table is managed via create_all (ORM) and gets its index
from the model definition (index=True). If the table exists in migrations,
the index will be applied here too.
"""
from alembic import op
from sqlalchemy import inspect

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # tasks
    op.create_index("ix_tasks_company_id", "tasks", ["company_id"])
    op.create_index("ix_tasks_agent_id", "tasks", ["agent_id"])
    # runs
    op.create_index("ix_runs_company_id", "runs", ["company_id"])
    op.create_index("ix_runs_task_id", "runs", ["task_id"])
    op.create_index("ix_runs_agent_id", "runs", ["agent_id"])
    # agents
    op.create_index("ix_agents_company_id", "agents", ["company_id"])
    # run_events — table may not exist in all migration paths (also covered by ORM create_all)
    if "run_events" in existing_tables:
        op.create_index("ix_run_events_run_id", "run_events", ["run_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    op.drop_index("ix_tasks_company_id", "tasks")
    op.drop_index("ix_tasks_agent_id", "tasks")
    op.drop_index("ix_runs_company_id", "runs")
    op.drop_index("ix_runs_task_id", "runs")
    op.drop_index("ix_runs_agent_id", "runs")
    op.drop_index("ix_agents_company_id", "agents")
    if "run_events" in existing_tables:
        op.drop_index("ix_run_events_run_id", "run_events")
