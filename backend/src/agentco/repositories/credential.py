from ..orm.credential import CredentialORM
from ..models.credential import Credential
from .base import BaseRepository


class CredentialRepository(BaseRepository[CredentialORM, Credential]):
    orm_model = CredentialORM

    def _to_domain(self, orm: CredentialORM) -> Credential:
        return Credential(
            id=orm.id,
            company_id=orm.company_id,
            provider=orm.provider,
            encrypted_api_key=orm.encrypted_api_key,
            created_at=orm.created_at,
        )

    def _to_orm(self, domain: Credential) -> CredentialORM:
        return CredentialORM(
            id=domain.id,
            company_id=domain.company_id,
            provider=domain.provider,
            encrypted_api_key=domain.encrypted_api_key,
        )

    def list_by_company(self, company_id: str) -> list[Credential]:
        return self.list(company_id=company_id)
