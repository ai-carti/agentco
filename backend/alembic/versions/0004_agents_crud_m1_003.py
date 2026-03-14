"""agents CRUD — M1-003 (schema already present in 0001)

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-14 13:00:00.000000

Notes:
    The agents table was created in revision 0001 with all required columns:
    id, company_id (FK → companies.id), name, role, system_prompt, model, created_at.
    This revision documents the M1-003 CRUD endpoints milestone and is a no-op
    schema migration.
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Schema already complete from revision 0001.
    # Agents table has: id, company_id FK → companies.id, name, role,
    # system_prompt, model, library_agent_id, created_at.
    pass


def downgrade() -> None:
    pass
