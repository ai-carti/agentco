"""add owner_id to companies

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-14 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite requires batch mode for schema changes.
    # Add column first, then named FK constraint separately.
    with op.batch_alter_table("companies") as batch_op:
        batch_op.add_column(sa.Column("owner_id", sa.Text, nullable=True))
        batch_op.create_foreign_key(
            "fk_companies_owner_id",
            "users",
            ["owner_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("companies") as batch_op:
        batch_op.drop_constraint("fk_companies_owner_id", type_="foreignkey")
        batch_op.drop_column("owner_id")
