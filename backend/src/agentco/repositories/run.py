from typing import Optional

from sqlalchemy import select, or_, func

from ..orm.run import RunORM, RunEventORM
from ..models.run import Run, RunEvent
from .base import BaseRepository


class RunRepository(BaseRepository[RunORM, Run]):
    orm_model = RunORM

    def _to_domain(self, orm: RunORM) -> Run:
        return Run(
            id=orm.id,
            company_id=orm.company_id,
            goal=orm.goal,
            task_id=orm.task_id,
            agent_id=orm.agent_id,
            status=orm.status,
            total_cost_usd=orm.total_cost_usd,
            total_tokens=orm.total_tokens,
            started_at=orm.started_at,
            completed_at=orm.completed_at,
            created_at=orm.created_at,
            result=orm.result,
            error=orm.error,
        )

    def _to_orm(self, domain: Run) -> RunORM:
        return RunORM(
            id=domain.id,
            company_id=domain.company_id,
            goal=domain.goal,
            task_id=domain.task_id,
            agent_id=domain.agent_id,
            status=domain.status,
            total_cost_usd=domain.total_cost_usd,
            total_tokens=domain.total_tokens,
            started_at=domain.started_at,
            completed_at=domain.completed_at,
            created_at=domain.created_at,
        )

    def list_by_company(
        self,
        company_id: str,
        limit: int = 100,
        offset: int = 0,
        status_filter: Optional[str] = None,
    ) -> list[Run]:
        stmt = (
            select(self.orm_model)
            .where(RunORM.company_id == company_id)
            .order_by(RunORM.started_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if status_filter is not None:
            stmt = stmt.where(RunORM.status == status_filter)
        return [self._to_domain(row) for row in self._session.scalars(stmt).all()]

    def list_by_task(self, task_id: str, limit: int = 50, offset: int = 0) -> list[Run]:
        """ALEX-TD-043: pagination support for task runs list."""
        stmt = (
            select(self.orm_model)
            .where(RunORM.task_id == task_id)
            .order_by(RunORM.started_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return [self._to_domain(row) for row in self._session.scalars(stmt).all()]

    def find_active_by_task(self, task_id: str) -> Run | None:
        """Возвращает активный ран (pending или running) для задачи или None."""
        stmt = (
            select(self.orm_model)
            .where(RunORM.task_id == task_id)
            .where(or_(RunORM.status == "running", RunORM.status == "pending"))
            .limit(1)
        )
        row = self._session.scalars(stmt).first()
        return self._to_domain(row) if row else None

    def get_events_count(self, run_id: str) -> int:
        stmt = select(func.count(RunEventORM.id)).where(RunEventORM.run_id == run_id)
        return self._session.scalar(stmt) or 0

    def list_events(self, run_id: str, limit: int = 100, offset: int = 0) -> list[RunEvent]:
        """ALEX-TD-036: pagination support — default limit=100, max enforced at handler level."""
        stmt = (
            select(RunEventORM)
            .where(RunEventORM.run_id == run_id)
            .order_by(RunEventORM.created_at)
            .limit(limit)
            .offset(offset)
        )
        return [
            RunEvent(
                id=e.id,
                run_id=e.run_id,
                agent_id=e.agent_id,
                task_id=e.task_id,
                event_type=e.event_type,
                payload=e.payload,
                created_at=e.created_at,
            )
            for e in self._session.scalars(stmt).all()
        ]
