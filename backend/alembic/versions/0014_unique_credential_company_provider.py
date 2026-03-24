"""ALEX-TD-181: add UniqueConstraint(company_id, provider) to credentials table

Revision ID: 0014
Revises: 0013
Create Date: 2026-03-24

Rationale:
    ALEX-TD-175 added an app-level SELECT check in CredentialService.create() to
    prevent duplicate (company_id, provider) pairs. However, concurrent requests
    can race past the SELECT check (TOCTOU) before either commits, resulting in
    duplicate credentials that the orchestration layer silently ignores.

    A DB-level UNIQUE constraint makes the guarantee atomic — the second INSERT
    raises IntegrityError regardless of concurrent timing.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite does not support ADD CONSTRAINT — must use batch_alter_table.
    with op.batch_alter_table("credentials", schema=None) as batch_op:
        batch_op.create_unique_constraint(
            "uq_credentials_company_provider",
            ["company_id", "provider"],
        )


def downgrade() -> None:
    with op.batch_alter_table("credentials", schema=None) as batch_op:
        batch_op.drop_constraint("uq_credentials_company_provider", type_="unique")
