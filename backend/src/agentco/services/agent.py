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
               model: str = "gpt-4o-mini",
               parent_agent_id: str | None = None) -> Agent:
        self._check_company_owner(company_id, owner_id)
        # Determine hierarchy_level from parent
        hierarchy_level = 0
        if parent_agent_id:
            try:
                parent = self._repo.get(parent_agent_id)
                if parent.company_id != company_id:
                    raise NotFoundError(f"Parent agent {parent_agent_id!r} not in company")
                hierarchy_level = (parent.hierarchy_level or 0) + 1
            except NotFoundError:
                raise NotFoundError(f"Parent agent {parent_agent_id!r} not found")
        agent = Agent(company_id=company_id, name=name, role=role,
                      system_prompt=system_prompt, model=model,
                      parent_agent_id=parent_agent_id,
                      hierarchy_level=hierarchy_level)
        result = self._repo.add(agent)
        self._session.commit()
        return result

    def get(self, company_id: str, agent_id: str, owner_id: str) -> Agent:
        self._check_company_owner(company_id, owner_id)
        agent = self._repo.get(agent_id)
        if agent.company_id != company_id:
            raise NotFoundError(f"Agent {agent_id!r} not found in company {company_id!r}")
        return agent

    def list_by_company(self, company_id: str, owner_id: str, limit: int | None = None, offset: int | None = None) -> list[Agent]:
        self._check_company_owner(company_id, owner_id)
        return self._repo.list_by_company(company_id, limit=limit, offset=offset)

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

    def get_tree(self, company_id: str, owner_id: str) -> list[dict]:
        """
        Returns agents as a nested tree structure.
        Each node: {id, name, role, model, hierarchy_level, parent_agent_id, children: [...]}
        POST-006 AC5.
        """
        self._check_company_owner(company_id, owner_id)
        agents = self._repo.list_by_company(company_id)

        def _to_node(agent: Agent) -> dict:
            return {
                "id": agent.id,
                "name": agent.name,
                "role": agent.role,
                "model": agent.model,
                "system_prompt": agent.system_prompt,
                "hierarchy_level": agent.hierarchy_level,
                "parent_agent_id": agent.parent_agent_id,
                "children": [],
            }

        nodes = {a.id: _to_node(a) for a in agents}
        roots: list[dict] = []

        for agent in agents:
            node = nodes[agent.id]
            if agent.parent_agent_id and agent.parent_agent_id in nodes:
                nodes[agent.parent_agent_id]["children"].append(node)
            else:
                roots.append(node)

        return roots

    def delete(self, company_id: str, agent_id: str, owner_id: str) -> None:
        """ALEX-TD-064 fix: nullify task.agent_id before deleting agent.

        SQLite has PRAGMA foreign_keys=ON. Deleting an agent that has tasks would
        raise IntegrityError (FK constraint on tasks.agent_id → agents.id) → 500.
        Fix: set task.agent_id = NULL for all tasks of this agent before deletion.
        Tasks become unassigned but are preserved (non-destructive for user data).
        """
        self._check_company_owner(company_id, owner_id)
        agent_orm = self._session.get(self._repo.orm_model, agent_id)
        if agent_orm is None or agent_orm.company_id != company_id:
            raise NotFoundError(f"Agent {agent_id!r} not found")
        # Nullify FK references in tasks to avoid IntegrityError on DELETE
        for task_orm in list(agent_orm.tasks):
            task_orm.agent_id = None
        self._session.flush()
        self._session.delete(agent_orm)
        self._session.commit()
