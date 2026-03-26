"""ALEX-TD-257, ALEX-TD-258: UniqueConstraint on mcp_servers(agent_id, name); companies.owner_id NOT NULL

ALEX-TD-257: Add UniqueConstraint(agent_id, name) to mcp_servers.
  Prevents TOCTOU race condition where two concurrent POSTs pass the Python
  SELECT check and both INSERT duplicate MCP server names for the same agent.
  DB-level constraint is the only reliable guard.

ALEX-TD-258: Set companies.owner_id to NOT NULL.
  owner_id was nullable=True but all business logic assumes it is always set.
  A NULL owner_id silently breaks all ownership checks (NULL != any_user_id).
  Note: if existing rows have NULL owner_id, the upgrade will fail — clean up data first.

Revision ID: 0018
Revises: 0017
Create Date: 2026-03-26
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())

    # ALEX-TD-257: add UniqueConstraint(agent_id, name) on mcp_servers — idempotent
    # SQLite does not support ALTER TABLE ADD CONSTRAINT, must use batch mode (copy-and-move)
    existing_constraints = {
        uc["name"]
        for uc in inspector.get_unique_constraints("mcp_servers")
        if uc.get("name")
    }
    if "uq_mcp_servers_agent_name" not in existing_constraints:
        with op.batch_alter_table("mcp_servers") as batch_op:
            batch_op.create_unique_constraint("uq_mcp_servers_agent_name", ["agent_id", "name"])

    # ALEX-TD-258: make companies.owner_id NOT NULL — idempotent via column recreation
    # SQLite doesn't support ALTER COLUMN, so we need to check the nullable flag
    cols = {c["name"]: c for c in inspector.get_columns("companies")}
    if cols.get("owner_id", {}).get("nullable", True):
        # For SQLite: batch_alter_table handles column recreation
        with op.batch_alter_table("companies") as batch_op:
            batch_op.alter_column(
                "owner_id",
                existing_type=sa.Text(),
                nullable=False,
            )


def downgrade() -> None:
    inspector = inspect(op.get_bind())

    # Revert owner_id to nullable
    with op.batch_alter_table("companies") as batch_op:
        batch_op.alter_column(
            "owner_id",
            existing_type=sa.Text(),
            nullable=True,
        )

    # Drop the unique constraint — use batch mode for SQLite
    existing_constraints = {
        uc["name"]
        for uc in inspector.get_unique_constraints("mcp_servers")
        if uc.get("name")
    }
    if "uq_mcp_servers_agent_name" in existing_constraints:
        with op.batch_alter_table("mcp_servers") as batch_op:
            batch_op.drop_constraint("uq_mcp_servers_agent_name", type_="unique")
