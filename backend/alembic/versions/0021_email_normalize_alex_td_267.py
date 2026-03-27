"""ALEX-TD-267: normalize existing email addresses to lowercase.

ALEX-TD-265 added email.lower() in register/login handlers, but did not add a
data migration for users registered before the fix. Without this migration,
users who registered with mixed-case emails (e.g. Test@Example.COM) cannot log in
after deploying ALEX-TD-265 — login searches for test@example.com but the DB
stores Test@Example.COM.

Fix: UPDATE users SET email = LOWER(email)

Risk: low for pre-launch startup (no prod users yet), but required before
any production deployment of ALEX-TD-265.

Revision ID: 0021
Revises: 0020
Create Date: 2026-03-26
"""
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Normalize all existing user emails to lowercase."""
    op.execute("UPDATE users SET email = LOWER(email)")


def downgrade() -> None:
    """Cannot reverse email normalization — lowercased emails cannot be un-lowercased.

    This downgrade is a no-op. Reversing would require storing the original
    mixed-case email separately, which we do not do.
    """
    pass
