from ..orm.run import RunORM
from ..models.run import Run
from .base import BaseRepository


class RunRepository(BaseRepository[RunORM, Run]):
    orm_model = RunORM

    def _to_domain(self, orm: RunORM) -> Run:
        return Run(
            id=orm.id,
            company_id=orm.company_id,
            task_id=orm.task_id,
            agent_id=orm.agent_id,
            status=orm.status,
            started_at=orm.started_at,
            finished_at=orm.finished_at,
            cost_usd=orm.cost_usd,
            result=orm.result,
            error=orm.error,
        )

    def _to_orm(self, domain: Run) -> RunORM:
        return RunORM(
            id=domain.id,
            company_id=domain.company_id,
            task_id=domain.task_id,
            agent_id=domain.agent_id,
            status=domain.status,
        )

    def list_by_company(self, company_id: str, limit: int = 100, offset: int = 0) -> list[Run]:
        from sqlalchemy import select
        stmt = (
            select(self.orm_model)
            .where(RunORM.company_id == company_id)
            .limit(limit)
            .offset(offset)
        )
        return [self._to_domain(row) for row in self._session.scalars(stmt).all()]

    def list_by_task(self, task_id: str) -> list[Run]:
        return self.list(task_id=task_id)

    def find_active_by_task(self, task_id: str) -> Run | None:
        """Возвращает активный ран (pending или running) для задачи или None."""
        from sqlalchemy import select, or_
        stmt = (
            select(self.orm_model)
            .where(RunORM.task_id == task_id)
            .where(or_(RunORM.status == "running", RunORM.status == "pending"))
            .limit(1)
        )
        row = self._session.scalars(stmt).first()
        return self._to_domain(row) if row else None
