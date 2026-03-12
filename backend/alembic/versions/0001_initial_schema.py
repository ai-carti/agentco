"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-12 11:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable WAL mode for SQLite
    op.execute("PRAGMA journal_mode=WAL;")

    op.create_table(
        "companies",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    op.create_table(
        "agents",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("company_id", sa.Text, sa.ForeignKey("companies.id")),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("role", sa.Text),
        sa.Column("system_prompt", sa.Text),
        sa.Column("model", sa.Text, server_default=sa.text("'gpt-4o-mini'")),
        sa.Column("library_agent_id", sa.Text),
        sa.Column(
            "created_at",
            sa.DateTime,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    op.create_table(
        "tasks",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("company_id", sa.Text, sa.ForeignKey("companies.id")),
        sa.Column("agent_id", sa.Text, sa.ForeignKey("agents.id")),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column(
            "status",
            sa.Text,
            server_default=sa.text("'backlog'"),
        ),
        sa.Column("result", sa.Text),
        sa.Column(
            "created_at",
            sa.DateTime,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        # SQLite CHECK constraint via raw DDL appended below
    )

    op.create_table(
        "llm_credentials",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("company_id", sa.Text, sa.ForeignKey("companies.id")),
        sa.Column("provider", sa.Text, nullable=False),
        sa.Column("encrypted_key", sa.Text, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    op.create_table(
        "runs",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("company_id", sa.Text, sa.ForeignKey("companies.id")),
        sa.Column("task_id", sa.Text, sa.ForeignKey("tasks.id")),
        sa.Column("status", sa.Text, server_default=sa.text("'pending'")),
        sa.Column("started_at", sa.DateTime),
        sa.Column("finished_at", sa.DateTime),
        sa.Column("cost_usd", sa.Float, server_default=sa.text("0.0")),
    )


def downgrade() -> None:
    op.drop_table("runs")
    op.drop_table("llm_credentials")
    op.drop_table("tasks")
    op.drop_table("agents")
    op.drop_table("companies")
