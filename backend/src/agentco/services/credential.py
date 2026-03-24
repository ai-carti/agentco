from sqlalchemy.orm import Session
from sqlalchemy import select
from ..models.credential import Credential
from ..repositories.credential import CredentialRepository
from ..repositories.company import CompanyRepository
from ..repositories.base import NotFoundError, ConflictError
from ..orm.credential import CredentialORM
from . import encryption


class CredentialService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repo = CredentialRepository(session)
        self._company_repo = CompanyRepository(session)

    def _check_company_owner(self, company_id: str, owner_id: str) -> None:
        try:
            company = self._company_repo.get(company_id)
        except NotFoundError:
            raise NotFoundError(f"Company {company_id!r} not found")
        if company.owner_id != owner_id:
            raise NotFoundError(f"Company {company_id!r} not found")

    def create(self, company_id: str, provider: str, api_key: str, owner_id: str) -> Credential:
        self._check_company_owner(company_id, owner_id)
        # ALEX-TD-175: prevent duplicate (company_id, provider) pairs.
        # The orchestration layer always picks the first credential for a provider —
        # duplicates are silent dead weight and confuse users in the UI.
        existing = self._session.scalars(
            select(CredentialORM).where(
                CredentialORM.company_id == company_id,
                CredentialORM.provider == provider,
            )
        ).first()
        if existing is not None:
            raise ConflictError(
                f"Credential for provider '{provider}' already exists in company '{company_id}'. "
                "Delete the existing credential first to replace it."
            )
        encrypted = encryption.encrypt(api_key)
        cred = Credential(company_id=company_id, provider=provider, encrypted_api_key=encrypted)
        result = self._repo.add(cred)
        self._session.commit()
        return result

    def list_by_company(self, company_id: str, owner_id: str, limit: int | None = None, offset: int | None = None) -> list[Credential]:
        # ALEX-TD-098: propagate pagination params to repository
        self._check_company_owner(company_id, owner_id)
        return self._repo.list_by_company(company_id, limit=limit, offset=offset)

    def delete(self, company_id: str, credential_id: str, owner_id: str) -> None:
        self._check_company_owner(company_id, owner_id)
        cred_orm = self._session.get(CredentialORM, credential_id)
        if cred_orm is None or cred_orm.company_id != company_id:
            raise NotFoundError(f"Credential {credential_id!r} not found")
        self._session.delete(cred_orm)
        self._session.commit()

    def list_providers_for_user(self, owner_id: str) -> list[str]:
        """Return distinct providers across all companies owned by user."""
        # Get all company IDs owned by this user
        from ..orm.company import CompanyORM
        companies = self._session.scalars(
            select(CompanyORM).where(CompanyORM.owner_id == owner_id)
        ).all()
        company_ids = [c.id for c in companies]
        if not company_ids:
            return []
        rows = self._session.scalars(
            select(CredentialORM.provider).where(
                CredentialORM.company_id.in_(company_ids)
            ).distinct()
        ).all()
        return list(rows)
