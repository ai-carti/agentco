from ..orm.task import TaskORM
from ..models.task import Task
from .base import BaseRepository


class TaskRepository(BaseRepository[TaskORM, Task]):
    orm_model = TaskORM

    def _to_domain(self, orm: TaskORM) -> Task:
        return Task(
            id=orm.id, company_id=orm.company_id, agent_id=orm.agent_id,
            title=orm.title, description=orm.description,
            status=orm.status, result=orm.result, created_at=orm.created_at,
        )

    def _to_orm(self, domain: Task) -> TaskORM:
        return TaskORM(
            id=domain.id, company_id=domain.company_id, agent_id=domain.agent_id,
            title=domain.title, description=domain.description,
            status=domain.status,
        )

    def list_by_company(self, company_id: str) -> list[Task]:
        return self.list(company_id=company_id)

    def list_by_agent(self, agent_id: str) -> list[Task]:
        return self.list(agent_id=agent_id)

    def update_status(self, task_id: str, status: str) -> Task:
        orm = self._session.get(self.orm_model, task_id)
        if orm is None:
            from .base import NotFoundError
            raise NotFoundError(f"Task {task_id!r} not found")
        orm.status = status
        self._session.flush()
        return self._to_domain(orm)
