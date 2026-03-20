"""ALEX-TD-059/060: add indexes on credentials.company_id and mcp_servers.agent_id

Revision ID: 0011
Revises: 0010
Create Date: 2026-03-20

Fixes:
  - ALEX-TD-059: CredentialORM.company_id was missing index → full scan on list_by_company
  - ALEX-TD-060: MCPServerORM.agent_id was missing index → full scan on list_mcp_servers
"""
from alembic import op
from sqlalchemy import inspect

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # ALEX-TD-059: credentials.company_id index
    if "credentials" in existing_tables:
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("credentials")}
        if "ix_credentials_company_id" not in existing_indexes:
            op.create_index("ix_credentials_company_id", "credentials", ["company_id"])

    # ALEX-TD-060: mcp_servers.agent_id index
    if "mcp_servers" in existing_tables:
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("mcp_servers")}
        if "ix_mcp_servers_agent_id" not in existing_indexes:
            op.create_index("ix_mcp_servers_agent_id", "mcp_servers", ["agent_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "credentials" in existing_tables:
        op.drop_index("ix_credentials_company_id", "credentials")
    if "mcp_servers" in existing_tables:
        op.drop_index("ix_mcp_servers_agent_id", "mcp_servers")
