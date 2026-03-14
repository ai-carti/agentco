from sqlalchemy.orm import Session
from ..models.company import Company
from ..repositories.company import CompanyRepository
from ..repositories.base import NotFoundError


class CompanyService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repo = CompanyRepository(session)

    def create(self, name: str, owner_id: str | None = None) -> Company:
        if not name.strip():
            raise ValueError("Company name cannot be empty")
        company = Company(name=name.strip(), owner_id=owner_id)
        result = self._repo.add(company)
        self._session.commit()
        return result

    def get(self, company_id: str) -> Company:
        return self._repo.get(company_id)

    def list_all(self, owner_id: str | None = None) -> list[Company]:
        if owner_id is not None:
            return self._repo.list(owner_id=owner_id)
        return self._repo.list()

    def update(self, company_id: str, name: str) -> Company:
        if not name.strip():
            raise ValueError("Company name cannot be empty")
        result = self._repo.update_name(company_id, name.strip())
        self._session.commit()
        return result

    def delete(self, company_id: str) -> None:
        self._repo.delete(company_id)
        self._session.commit()
