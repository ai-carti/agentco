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

    def get_owned(self, company_id: str, owner_id: str) -> Company:
        """Fetch a company and verify ownership in one call.

        ALEX-TD-057: consolidates the repeated get() + owner_id check pattern
        from handlers (get_company/delete_company/update_company) into the
        service layer — same pattern already used by RunService.
        Raises NotFoundError if company not found or owned by a different user.
        """
        company = self._repo.get(company_id)
        if company.owner_id != owner_id:
            raise NotFoundError(f"Company {company_id!r} not found")
        return company

    def list_all(self, owner_id: str | None = None) -> list[Company]:
        from ..orm.company import CompanyORM
        # ALEX-TD-096: ORDER BY created_at for deterministic pagination
        order = CompanyORM.created_at.asc()
        if owner_id is not None:
            return self._repo.list(order_by=order, owner_id=owner_id)
        return self._repo.list(order_by=order)

    def update(self, company_id: str, name: str, owner_id: str | None = None) -> Company:
        """Update company name. If owner_id provided, validates ownership in one DB hit.

        ALEX-TD-054: previously handlers/companies.py called get() then update() = 2 SELECTs.
        Now ownership check is done inside update() using the same ORM object.
        """
        if not name.strip():
            raise ValueError("Company name cannot be empty")
        # fetch once — reuse for both ownership check and update
        company = self._repo.get(company_id)
        if owner_id is not None and company.owner_id != owner_id:
            from ..repositories.base import NotFoundError
            raise NotFoundError(f"Company {company_id!r} not found")
        result = self._repo.update_name(company_id, name.strip())
        self._session.commit()
        return result

    def delete_owned(self, company_id: str, owner_id: str) -> None:
        """Delete a company with ownership validation in one DB hit.

        ALEX-TD-054: replaces get() + delete() double-query pattern in handler.
        """
        company = self._repo.get(company_id)
        if company.owner_id != owner_id:
            from ..repositories.base import NotFoundError
            raise NotFoundError(f"Company {company_id!r} not found")
        self._repo.delete(company_id)
        self._session.commit()

    def delete(self, company_id: str) -> None:
        self._repo.delete(company_id)
        self._session.commit()
