from sqlalchemy.orm import Session
from ..models.task import Task, TASK_FSM
from ..repositories.task import TaskRepository
from ..repositories.company import CompanyRepository
from ..repositories.agent import AgentRepository
from ..repositories.base import NotFoundError


class InvalidTransitionError(ValueError):
    pass


class TaskService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repo = TaskRepository(session)
        self._company_repo = CompanyRepository(session)
        self._agent_repo = AgentRepository(session)

    def _check_company_owner(self, company_id: str, owner_id: str) -> None:
        """Raises NotFoundError if company doesn't exist or doesn't belong to owner_id."""
        try:
            company = self._company_repo.get(company_id)
        except NotFoundError:
            raise NotFoundError(f"Company {company_id!r} not found")
        if company.owner_id != owner_id:
            raise NotFoundError(f"Company {company_id!r} not found")

    def _check_agent(self, company_id: str, agent_id: str) -> None:
        """Raises NotFoundError if agent doesn't exist or doesn't belong to company."""
        try:
            agent = self._agent_repo.get(agent_id)
        except NotFoundError:
            raise NotFoundError(f"Agent {agent_id!r} not found")
        if agent.company_id != company_id:
            raise NotFoundError(f"Agent {agent_id!r} not found in company {company_id!r}")

    def create(self, company_id: str, agent_id: str, owner_id: str,
               title: str, description: str | None = None) -> Task:
        self._check_company_owner(company_id, owner_id)
        self._check_agent(company_id, agent_id)
        task = Task(company_id=company_id, agent_id=agent_id, title=title,
                    description=description, status="todo")
        result = self._repo.add(task)
        self._session.commit()
        return result

    def get(self, company_id: str, agent_id: str, task_id: str, owner_id: str) -> Task:
        self._check_company_owner(company_id, owner_id)
        self._check_agent(company_id, agent_id)
        task = self._repo.get(task_id)
        if task.agent_id != agent_id or task.company_id != company_id:
            raise NotFoundError(f"Task {task_id!r} not found")
        return task

    def list_by_agent(self, company_id: str, agent_id: str, owner_id: str) -> list[Task]:
        self._check_company_owner(company_id, owner_id)
        self._check_agent(company_id, agent_id)
        return self._repo.list(agent_id=agent_id, company_id=company_id)

    def update(self, company_id: str, agent_id: str, task_id: str, owner_id: str,
               title: str | None = None, description: str | None = None) -> Task:
        self._check_company_owner(company_id, owner_id)
        self._check_agent(company_id, agent_id)
        task_orm = self._session.get(self._repo.orm_model, task_id)
        if task_orm is None or task_orm.agent_id != agent_id or task_orm.company_id != company_id:
            raise NotFoundError(f"Task {task_id!r} not found")
        if title is not None:
            task_orm.title = title
        if description is not None:
            task_orm.description = description
        self._session.flush()
        self._session.commit()
        return self._repo._to_domain(task_orm)

    def update_status(self, company_id: str, agent_id: str, task_id: str,
                      owner_id: str, new_status: str) -> Task:
        self._check_company_owner(company_id, owner_id)
        self._check_agent(company_id, agent_id)
        task_orm = self._session.get(self._repo.orm_model, task_id)
        if task_orm is None or task_orm.agent_id != agent_id or task_orm.company_id != company_id:
            raise NotFoundError(f"Task {task_id!r} not found")
        current = task_orm.status
        allowed = TASK_FSM.get(current, set())
        if new_status not in allowed:
            raise InvalidTransitionError(
                f"Invalid transition: {current!r} → {new_status!r}. "
                f"Allowed: {allowed or 'none (terminal state)'}"
            )
        task_orm.status = new_status
        self._session.flush()
        self._session.commit()
        return self._repo._to_domain(task_orm)

    def delete(self, company_id: str, agent_id: str, task_id: str, owner_id: str) -> None:
        self._check_company_owner(company_id, owner_id)
        self._check_agent(company_id, agent_id)
        task_orm = self._session.get(self._repo.orm_model, task_id)
        if task_orm is None or task_orm.agent_id != agent_id or task_orm.company_id != company_id:
            raise NotFoundError(f"Task {task_id!r} not found")
        self._session.delete(task_orm)
        self._session.commit()
