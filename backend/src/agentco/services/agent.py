from sqlalchemy.orm import Session
from ..models.agent import Agent
from ..repositories.agent import AgentRepository
from ..repositories.company import CompanyRepository


class AgentService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repo = AgentRepository(session)
        self._company_repo = CompanyRepository(session)

    def create(self, company_id: str, name: str, role: str | None = None,
               system_prompt: str | None = None, model: str = "gpt-4o-mini") -> Agent:
        self._company_repo.get(company_id)  # validates company exists
        agent = Agent(company_id=company_id, name=name, role=role,
                      system_prompt=system_prompt, model=model)
        result = self._repo.add(agent)
        self._session.commit()
        return result

    def get(self, agent_id: str) -> Agent:
        return self._repo.get(agent_id)

    def list_by_company(self, company_id: str) -> list[Agent]:
        return self._repo.list_by_company(company_id)
