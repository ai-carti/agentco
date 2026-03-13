from ..orm.company import CompanyORM
from ..models.company import Company
from .base import BaseRepository


class CompanyRepository(BaseRepository[CompanyORM, Company]):
    orm_model = CompanyORM

    def _to_domain(self, orm: CompanyORM) -> Company:
        return Company(id=orm.id, name=orm.name, created_at=orm.created_at)

    def _to_orm(self, domain: Company) -> CompanyORM:
        return CompanyORM(id=domain.id, name=domain.name)
