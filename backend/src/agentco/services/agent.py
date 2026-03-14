from sqlalchemy.orm import Session
from ..models.agent import Agent
from ..repositories.agent import AgentRepository
from ..repositories.company import CompanyRepository
from ..repositories.base import NotFoundError


class AgentService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repo = AgentRepository(session)
        self._company_repo = CompanyRepository(session)

    def _check_company_owner(self, company_id: str, owner_id: str) -> None:
        """Raises NotFoundError if company doesn't exist or doesn't belong to owner_id."""
        try:
            company = self._company_repo.get(company_id)
        except NotFoundError:
            raise NotFoundError(f"Company {company_id!r} not found")
        if company.owner_id != owner_id:
            raise NotFoundError(f"Company {company_id!r} not found")

    def create(self, company_id: str, owner_id: str, name: str,
               role: str | None = None, system_prompt: str | None = None,
               model: str = "gpt-4o-mini") -> Agent:
        self._check_company_owner(company_id, owner_id)
        agent = Agent(company_id=company_id, name=name, role=role,
                      system_prompt=system_prompt, model=model)
        result = self._repo.add(agent)
        self._session.commit()
        return result

    def get(self, company_id: str, agent_id: str, owner_id: str) -> Agent:
        self._check_company_owner(company_id, owner_id)
        agent = self._repo.get(agent_id)
        if agent.company_id != company_id:
            raise NotFoundError(f"Agent {agent_id!r} not found in company {company_id!r}")
        return agent

    def list_by_company(self, company_id: str, owner_id: str) -> list[Agent]:
        self._check_company_owner(company_id, owner_id)
        return self._repo.list_by_company(company_id)

    def update(self, company_id: str, agent_id: str, owner_id: str,
               name: str | None = None, role: str | None = None,
               system_prompt: str | None = None, model: str | None = None) -> Agent:
        self._check_company_owner(company_id, owner_id)
        agent_orm = self._session.get(self._repo.orm_model, agent_id)
        if agent_orm is None or agent_orm.company_id != company_id:
            raise NotFoundError(f"Agent {agent_id!r} not found")
        if name is not None:
            agent_orm.name = name
        if role is not None:
            agent_orm.role = role
        if system_prompt is not None:
            agent_orm.system_prompt = system_prompt
        if model is not None:
            agent_orm.model = model
        self._session.flush()
        self._session.commit()
        return self._repo._to_domain(agent_orm)

    def delete(self, company_id: str, agent_id: str, owner_id: str) -> None:
        self._check_company_owner(company_id, owner_id)
        agent_orm = self._session.get(self._repo.orm_model, agent_id)
        if agent_orm is None or agent_orm.company_id != company_id:
            raise NotFoundError(f"Agent {agent_id!r} not found")
        self._session.delete(agent_orm)
        self._session.commit()
