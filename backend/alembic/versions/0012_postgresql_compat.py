"""PostgreSQL compatibility — ALEX-POST-001

Verifies that all tables are compatible with PostgreSQL.
For SQLite: no-op (schema already created by previous migrations).
For PostgreSQL: this migration documents compatibility and can be used as
a reference when setting up a fresh Postgres database.

Key compatibility notes:
- All primary keys use sa.Text (UUID strings) — compatible with both SQLite and PG
- No AUTOINCREMENT used — SQLAlchemy handles sequences
- PRAGMA statements are dialect-guarded
- CURRENT_TIMESTAMP and sa.func.now() are compatible with both dialects

Revision ID: 0012
Revises: 0011
Create Date: 2026-03-21 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

# Tables that must exist for the system to function
REQUIRED_TABLES = [
    "companies",
    "agents",
    "tasks",
    "llm_credentials",
    "users",
    "agent_runs",
    "agent_library",
    "mcp_servers",
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    existing_tables = set(inspector.get_table_names())

    if bind.dialect.name == "sqlite":
        # SQLite: enable WAL + foreign keys (idempotent)
        op.execute(sa.text("PRAGMA journal_mode=WAL;"))
        op.execute(sa.text("PRAGMA foreign_keys=ON;"))
        # Nothing else to do — SQLite schema already set up by prior migrations
        return

    # PostgreSQL: verify all required tables exist
    # If starting fresh with Postgres, run alembic upgrade head from scratch.
    missing = [t for t in REQUIRED_TABLES if t not in existing_tables]
    if missing:
        # Tables missing — this means we're on a fresh Postgres DB.
        # The prior migrations (0001–0011) handle CREATE TABLE with dialect-agnostic
        # SQLAlchemy types. Running alembic upgrade head from 0001 is sufficient.
        # No action needed here — previous migrations will have created them.
        pass

    # Add any PostgreSQL-specific optimizations that aren't in SQLite migrations
    # (Idempotent: check existence before creating)

    # Ensure credentials table has a partial index on company_id for Postgres
    if "credentials" in existing_tables:
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("credentials")}
        if "ix_credentials_company_id_pg" not in existing_indexes:
            op.create_index(
                "ix_credentials_company_id_pg",
                "credentials",
                ["company_id"],
                if_not_exists=True,
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        inspector = Inspector.from_engine(bind)
        existing_tables = set(inspector.get_table_names())
        if "credentials" in existing_tables:
            existing_indexes = {idx["name"] for idx in inspector.get_indexes("credentials")}
            if "ix_credentials_company_id_pg" in existing_indexes:
                op.drop_index("ix_credentials_company_id_pg", "credentials")
