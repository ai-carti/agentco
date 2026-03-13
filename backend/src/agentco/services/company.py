from sqlalchemy.orm import Session
from ..models.company import Company
from ..repositories.company import CompanyRepository


class CompanyService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repo = CompanyRepository(session)

    def create(self, name: str) -> Company:
        if not name.strip():
            raise ValueError("Company name cannot be empty")
        company = Company(name=name.strip())
        result = self._repo.add(company)
        self._session.commit()
        return result

    def get(self, company_id: str) -> Company:
        return self._repo.get(company_id)

    def list_all(self) -> list[Company]:
        return self._repo.list()

    def delete(self, company_id: str) -> None:
        self._repo.delete(company_id)
        self._session.commit()
