"""
ALEX-TD-180: handlers/templates.py — CreateFromTemplateRequest.template_id missing max_length.
ALEX-TD-181: orm/credential.py — missing DB-level UniqueConstraint("company_id", "provider").

TDD: tests written FIRST (red), then code makes them green.
"""
import pytest
from pydantic import ValidationError


# ── ALEX-TD-180: template_id max_length ─────────────────────────────────────

class TestALEXTD180TemplateIdMaxLength:
    """
    ALEX-TD-180: CreateFromTemplateRequest.template_id must have max_length constraint.

    Without max_length, a 10KB+ template_id string passes Pydantic validation,
    allocates full buffer, then does a dict lookup in get_template().
    For consistency with all ID fields in the project (max_length=100),
    template_id must be constrained.
    """

    def _get_template_id_max_length(self):
        """Extract maxLength from template_id field schema."""
        from agentco.handlers.templates import CreateFromTemplateRequest
        schema = CreateFromTemplateRequest.model_json_schema()
        prop = schema.get("properties", {}).get("template_id", {})
        if "maxLength" in prop:
            return prop["maxLength"]
        for variant in prop.get("anyOf", []):
            if "maxLength" in variant:
                return variant["maxLength"]
        return None

    def test_template_id_has_max_length(self):
        """CreateFromTemplateRequest.template_id must have max_length in JSON schema."""
        max_length = self._get_template_id_max_length()
        assert max_length is not None, (
            "CreateFromTemplateRequest.template_id is missing maxLength. "
            "Add: template_id: str = Field(max_length=100)"
        )

    def test_template_id_max_length_value(self):
        """template_id maxLength should be at most 100."""
        max_length = self._get_template_id_max_length()
        assert max_length is not None, "maxLength not set on template_id"
        assert max_length <= 100, (
            f"template_id maxLength={max_length} is too large. "
            "Use max_length=100 for consistency with other ID fields."
        )

    def test_template_id_rejects_oversized_value(self):
        """CreateFromTemplateRequest must reject template_id longer than max_length."""
        from agentco.handlers.templates import CreateFromTemplateRequest

        oversized = "x" * 200  # 200 chars >> 100 max
        try:
            CreateFromTemplateRequest(template_id=oversized, name="Test Company")
            assert False, (
                "CreateFromTemplateRequest accepted a 200-char template_id — "
                "max_length validation is not enforced"
            )
        except ValidationError:
            pass  # expected

    def test_template_id_accepts_valid_value(self):
        """CreateFromTemplateRequest must accept normal template IDs."""
        from agentco.handlers.templates import CreateFromTemplateRequest

        obj = CreateFromTemplateRequest(template_id="startup-team", name="My Company")
        assert obj.template_id == "startup-team"

    def test_template_id_accepts_max_length_boundary(self):
        """CreateFromTemplateRequest must accept template_id at exactly max_length chars."""
        from agentco.handlers.templates import CreateFromTemplateRequest

        max_len = self._get_template_id_max_length() or 100
        boundary = "a" * max_len
        obj = CreateFromTemplateRequest(template_id=boundary, name="My Company")
        assert obj.template_id == boundary


# ── ALEX-TD-181: UniqueConstraint on credentials(company_id, provider) ────────

class TestALEXTD181CredentialUniqueConstraint:
    """
    ALEX-TD-181: CredentialORM must have DB-level UniqueConstraint on (company_id, provider).

    App-level SELECT check (ALEX-TD-175) guards against logical duplicates,
    but concurrent requests can race past it (TOCTOU).
    A DB-level constraint makes the guarantee atomic.
    """

    def test_credential_orm_has_table_args(self):
        """CredentialORM must have __table_args__ defined."""
        from agentco.orm.credential import CredentialORM
        assert hasattr(CredentialORM, "__table_args__"), (
            "CredentialORM has no __table_args__. "
            "Add UniqueConstraint('company_id', 'provider', name='uq_credentials_company_provider')"
        )

    def test_credential_orm_has_unique_constraint_company_provider(self):
        """CredentialORM.__table_args__ must include UniqueConstraint on (company_id, provider)."""
        from agentco.orm.credential import CredentialORM
        from sqlalchemy import UniqueConstraint

        table_args = CredentialORM.__table_args__
        # table_args can be a tuple of constraints, or a tuple ending with a dict
        if isinstance(table_args, dict):
            constraints = []
        elif isinstance(table_args, tuple):
            constraints = [a for a in table_args if not isinstance(a, dict)]
        else:
            constraints = [table_args]

        unique_constraints = [c for c in constraints if isinstance(c, UniqueConstraint)]
        assert unique_constraints, (
            "CredentialORM.__table_args__ has no UniqueConstraint. "
            "Add: UniqueConstraint('company_id', 'provider', name='uq_credentials_company_provider')"
        )

        # Check it covers the right columns
        matching = [
            uc for uc in unique_constraints
            if set(col.key for col in uc.columns) >= {"company_id", "provider"}
            or (hasattr(uc, '_pending_colargs') and set(uc._pending_colargs) >= {"company_id", "provider"})
        ]

        # Fallback: check by constraint name convention
        if not matching:
            named = [uc for uc in unique_constraints if "company" in (uc.name or "") and "provider" in (uc.name or "")]
            assert named, (
                f"Found UniqueConstraint(s) {[uc.name for uc in unique_constraints]} "
                "but none covers (company_id, provider). "
                "Add: UniqueConstraint('company_id', 'provider', name='uq_credentials_company_provider')"
            )

    def test_credential_unique_constraint_has_name(self):
        """UniqueConstraint on (company_id, provider) must have an explicit name."""
        from agentco.orm.credential import CredentialORM
        from sqlalchemy import UniqueConstraint

        table_args = CredentialORM.__table_args__
        if isinstance(table_args, tuple):
            constraints = [a for a in table_args if isinstance(a, UniqueConstraint)]
        else:
            constraints = []

        for uc in constraints:
            if uc.name and ("company" in uc.name or "provider" in uc.name or "credential" in uc.name):
                return  # found named constraint

        assert False, (
            "UniqueConstraint on credentials(company_id, provider) has no name. "
            "Add name='uq_credentials_company_provider' for clear migration diffs."
        )

    def test_duplicate_credential_raises_integrity_error_in_db(self):
        """Inserting duplicate (company_id, provider) must raise IntegrityError at DB level."""
        import uuid
        from sqlalchemy import create_engine, text
        from sqlalchemy.orm import Session
        from sqlalchemy.exc import IntegrityError
        from agentco.orm.base import Base
        from agentco.orm.credential import CredentialORM
        from agentco.orm.company import CompanyORM
        from agentco.orm.user import UserORM

        # In-memory SQLite for isolation
        engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(engine)

        with Session(engine) as session:
            # Create user + company
            user = UserORM(id=str(uuid.uuid4()), email="test@example.com", hashed_password="x")
            company = CompanyORM(id=str(uuid.uuid4()), name="Test Co", owner_id=user.id)
            session.add(user)
            session.add(company)
            session.flush()

            # First credential — OK
            c1 = CredentialORM(
                id=str(uuid.uuid4()),
                company_id=company.id,
                provider="openai",
                encrypted_api_key="encrypted-key-1",
            )
            session.add(c1)
            session.flush()

            # Second credential with same company_id + provider — must fail at DB level
            c2 = CredentialORM(
                id=str(uuid.uuid4()),
                company_id=company.id,
                provider="openai",
                encrypted_api_key="encrypted-key-2",
            )
            session.add(c2)

            with pytest.raises(IntegrityError, match="UNIQUE constraint failed|unique"):
                session.flush()
