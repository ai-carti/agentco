from sqlalchemy.orm import Session
from ..models.task import Task
from ..repositories.task import TaskRepository
from ..repositories.company import CompanyRepository

VALID_STATUSES = {"backlog", "in_progress", "done", "cancelled"}


class TaskService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repo = TaskRepository(session)
        self._company_repo = CompanyRepository(session)

    def create(self, company_id: str, title: str, description: str | None = None,
               agent_id: str | None = None) -> Task:
        self._company_repo.get(company_id)
        task = Task(company_id=company_id, title=title,
                    description=description, agent_id=agent_id)
        result = self._repo.add(task)
        self._session.commit()
        return result

    def get(self, task_id: str) -> Task:
        return self._repo.get(task_id)

    def list_by_company(self, company_id: str) -> list[Task]:
        return self._repo.list_by_company(company_id)

    def update_status(self, task_id: str, status: str) -> Task:
        if status not in VALID_STATUSES:
            raise ValueError(f"Invalid status {status!r}. Must be one of {VALID_STATUSES}")
        result = self._repo.update_status(task_id, status)
        self._session.commit()
        return result
