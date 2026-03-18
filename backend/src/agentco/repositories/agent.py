from ..orm.agent import AgentORM
from ..models.agent import Agent
from .base import BaseRepository


class AgentRepository(BaseRepository[AgentORM, Agent]):
    orm_model = AgentORM

    def _to_domain(self, orm: AgentORM) -> Agent:
        return Agent(
            id=orm.id, company_id=orm.company_id, name=orm.name,
            role=orm.role, system_prompt=orm.system_prompt,
            model=orm.model, library_agent_id=orm.library_agent_id,
            parent_agent_id=orm.parent_agent_id,
            hierarchy_level=orm.hierarchy_level or 0,
            created_at=orm.created_at,
        )

    def _to_orm(self, domain: Agent) -> AgentORM:
        return AgentORM(
            id=domain.id, company_id=domain.company_id, name=domain.name,
            role=domain.role, system_prompt=domain.system_prompt,
            model=domain.model, library_agent_id=domain.library_agent_id,
            parent_agent_id=domain.parent_agent_id,
            hierarchy_level=domain.hierarchy_level,
        )

    def list_by_company(self, company_id: str) -> list[Agent]:
        return self.list(company_id=company_id)
