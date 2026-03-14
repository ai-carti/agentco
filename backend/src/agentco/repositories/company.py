from ..orm.company import CompanyORM
from ..models.company import Company
from .base import BaseRepository, NotFoundError


class CompanyRepository(BaseRepository[CompanyORM, Company]):
    orm_model = CompanyORM

    def _to_domain(self, orm: CompanyORM) -> Company:
        return Company(id=orm.id, name=orm.name, created_at=orm.created_at, owner_id=orm.owner_id)

    def _to_orm(self, domain: Company) -> CompanyORM:
        return CompanyORM(id=domain.id, name=domain.name, owner_id=domain.owner_id)

    def update_name(self, company_id: str, new_name: str) -> Company:
        orm = self._session.get(self.orm_model, company_id)
        if orm is None:
            raise NotFoundError(f"CompanyORM {company_id!r} not found")
        orm.name = new_name
        self._session.flush()
        return self._to_domain(orm)
