from ..orm.run import RunORM
from ..models.run import Run
from .base import BaseRepository


class RunRepository(BaseRepository[RunORM, Run]):
    orm_model = RunORM

    def _to_domain(self, orm: RunORM) -> Run:
        return Run(
            id=orm.id, company_id=orm.company_id, task_id=orm.task_id,
            status=orm.status, started_at=orm.started_at,
            finished_at=orm.finished_at, cost_usd=orm.cost_usd,
        )

    def _to_orm(self, domain: Run) -> RunORM:
        return RunORM(
            id=domain.id, company_id=domain.company_id, task_id=domain.task_id,
            status=domain.status,
        )

    def list_by_task(self, task_id: str) -> list[Run]:
        return self.list(task_id=task_id)
