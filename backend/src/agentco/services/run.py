"""
RunService — business logic для Runs API (M2-004).

Lifecycle:
    POST /companies/{id}/runs:
        1. Создаёт Run(status=pending, goal=...) в БД
        2. LangGraph подключится позже — tasks пока не создаются

    POST /tasks/{id}/run:
        1. Создаёт Run(status=pending) в БД
        2. Запускает _execute_agent как asyncio background task
        3. Возвращает run_id

    POST /runs/{id}/stop:
        - Отменяет asyncio task если running
        - Обновляет статус → stopped
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Callable, Optional

from sqlalchemy.orm import Session, sessionmaker

from ..models.run import Run, RunEvent
from ..repositories.run import RunRepository
from ..repositories.company import CompanyRepository
from ..repositories.task import TaskRepository
from ..repositories.base import NotFoundError, ConflictError
from ..core.event_bus import EventBus

logger = logging.getLogger(__name__)


class RunService:
    # Глобальный реестр активных asyncio Tasks: run_id → asyncio.Task
    _active_tasks: dict[str, asyncio.Task] = {}

    def __init__(self, session: Session) -> None:
        self._session = session
        self._repo = RunRepository(session)
        self._task_repo = TaskRepository(session)
        self._company_repo = CompanyRepository(session)

    def create_with_goal(self, company_id: str, goal: str, owner_id: str) -> Run:
        """Create a run with a goal. Validates company ownership."""
        company = self._company_repo.get(company_id)
        if company.owner_id != owner_id:
            raise NotFoundError(f"Company {company_id!r} not found")

        run = Run(
            company_id=company_id,
            goal=goal.strip(),
            status="pending",
            started_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        run = self._repo.add(run)
        self._session.commit()
        return run

    def create_and_start(
        self,
        company_id: str,
        task_id: str,
        owner_id: str,
        session_factory: Callable[[], Session],
    ) -> Run:
        """
        Создаёт Run в БД (pending), стартует background task.
        Возвращает созданный Run.
        """
        # 0. Проверяем ownership компании
        company = self._company_repo.get(company_id)
        if company.owner_id != owner_id:
            raise NotFoundError(f"Company {company_id!r} not found")

        # 1. Проверяем что task существует и принадлежит компании
        try:
            task = self._task_repo.get(task_id)
        except NotFoundError:
            raise NotFoundError(f"Task {task_id!r} not found")

        if task.company_id != company_id:
            raise NotFoundError(f"Task {task_id!r} not found in company {company_id!r}")

        # 2. Проверяем, нет ли уже активного рана для этой задачи
        existing = self._repo.find_active_by_task(task_id)
        if existing is not None:
            raise ConflictError(
                f"Task {task_id!r} already has an active run {existing.id!r} (status={existing.status!r}). "
                "Stop it before starting a new one."
            )

        agent_id = task.agent_id

        # 4. Создаём Run
        run = Run(
            company_id=company_id,
            task_id=task_id,
            agent_id=agent_id,
            status="pending",
            started_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        run = self._repo.add(run)
        self._session.commit()

        # 5. Публикуем run.started
        bus = EventBus.get()
        loop = asyncio.get_running_loop()
        loop.create_task(bus.publish({
            "type": "run.started",
            "company_id": company_id,
            "run_id": run.id,
            "payload": {"status": "pending", "task_id": task_id},
        }))

        # 6. Запускаем background task
        bg_task = loop.create_task(
            self._execute_agent(run.id, task_id, agent_id, company_id, session_factory)
        )
        RunService._active_tasks[run.id] = bg_task

        # Cleanup на завершении
        def _on_done(fut: asyncio.Task):
            RunService._active_tasks.pop(run.id, None)

        bg_task.add_done_callback(_on_done)

        return run

    async def _execute_agent(
        self,
        run_id: str,
        task_id: str,
        agent_id: Optional[str],
        company_id: str,
        session_factory: Callable[[], Session],
    ) -> str:
        """
        Background execution stub.
        M2-003 agent_node вызывается здесь; для M2-004 — заглушка.
        """
        bus = EventBus.get()

        with session_factory() as session:
            run_orm = session.get(self._repo.orm_model, run_id)
            if run_orm is None:
                return ""
            run_orm.status = "running"
            session.commit()

        # TODO: реальный вызов agent_node через LangGraph
        await asyncio.sleep(0)  # yield control

        result = f"Agent completed task {task_id}"
        try:
            with session_factory() as session:
                run_orm = session.get(self._repo.orm_model, run_id)
                if run_orm and run_orm.status == "running":
                    run_orm.status = "done"
                    run_orm.result = result
                    run_orm.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    session.commit()

            await bus.publish({
                "type": "run.done",
                "company_id": company_id,
                "run_id": run_id,
                "payload": {"result": result},
            })
        except Exception as exc:
            with session_factory() as session:
                run_orm = session.get(self._repo.orm_model, run_id)
                if run_orm:
                    run_orm.status = "failed"
                    run_orm.error = str(exc)
                    run_orm.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    session.commit()

            await bus.publish({
                "type": "run.failed",
                "company_id": company_id,
                "run_id": run_id,
                "payload": {"error": str(exc)},
            })

        return result

    def get(self, company_id: str, run_id: str) -> Run:
        """Возвращает Run по id, проверяет принадлежность компании."""
        try:
            run = self._repo.get(run_id)
        except NotFoundError:
            raise NotFoundError(f"Run {run_id!r} not found")
        if run.company_id != company_id:
            raise NotFoundError(f"Run {run_id!r} not found in company {company_id!r}")
        return run

    def get_detail(self, company_id: str, run_id: str, owner_id: str) -> dict:
        """Run details with events count. Validates ownership."""
        company = self._company_repo.get(company_id)
        if company.owner_id != owner_id:
            raise NotFoundError(f"Company {company_id!r} not found")
        run = self.get(company_id, run_id)
        events_count = self._repo.get_events_count(run_id)
        return {**run.model_dump(), "events_count": events_count}

    def list_by_company(self, company_id: str, limit: int = 100, offset: int = 0) -> list[Run]:
        """Список ранов компании с пагинацией."""
        return self._repo.list_by_company(company_id, limit=limit, offset=offset)

    def list_by_company_owned(self, company_id: str, owner_id: str, limit: int = 100, offset: int = 0) -> list[Run]:
        """Список ранов компании — с проверкой ownership."""
        company = self._company_repo.get(company_id)
        if company.owner_id != owner_id:
            raise NotFoundError(f"Company {company_id!r} not found")
        return self._repo.list_by_company(company_id, limit=limit, offset=offset)

    def list_by_task_owned(self, company_id: str, task_id: str, owner_id: str) -> list[Run]:
        """Список ранов задачи — с проверкой ownership."""
        company = self._company_repo.get(company_id)
        if company.owner_id != owner_id:
            raise NotFoundError(f"Company {company_id!r} not found")
        try:
            task = self._task_repo.get(task_id)
        except NotFoundError:
            raise NotFoundError(f"Task {task_id!r} not found")
        if task.company_id != company_id:
            raise NotFoundError(f"Task {task_id!r} not found in company {company_id!r}")
        return self._repo.list_by_task(task_id)

    def get_task_run_detail(self, company_id: str, task_id: str, run_id: str, owner_id: str) -> dict:
        """Run details for a specific task. Validates ownership and task membership."""
        company = self._company_repo.get(company_id)
        if company.owner_id != owner_id:
            raise NotFoundError(f"Company {company_id!r} not found")
        run = self.get(company_id, run_id)
        if run.task_id != task_id:
            raise NotFoundError(f"Run {run_id!r} not found for task {task_id!r}")
        events_count = self._repo.get_events_count(run_id)
        return {**run.model_dump(), "events_count": events_count}

    def list_events(self, company_id: str, run_id: str, owner_id: str) -> list[RunEvent]:
        """Events list for a run. Validates ownership."""
        company = self._company_repo.get(company_id)
        if company.owner_id != owner_id:
            raise NotFoundError(f"Company {company_id!r} not found")
        # Validate run belongs to company
        self.get(company_id, run_id)
        return self._repo.list_events(run_id)

    async def execute_run(self, run_id: str) -> str:
        """
        M2-002 AC: RunService.execute_run(run_id) запускает граф для конкретного рана.

        Загружает ран из БД, строит и запускает LangGraph граф через AsyncSqliteSaver checkpointer.
        Эмитирует события в EventBus при смене статуса агента.
        """
        from ..orchestration.graph import compile as compile_graph
        from ..orchestration.checkpointer import create_checkpointer
        from ..orchestration.state import AgentState
        import uuid

        bus = EventBus.get()

        # Получаем ран из БД
        run_orm = self._session.get(self._repo.orm_model, run_id)
        if run_orm is None:
            raise ValueError(f"Run {run_id!r} not found")

        # Обновляем статус → running
        run_orm.status = "running"
        self._session.commit()

        await bus.publish({
            "type": "run.status_changed",
            "company_id": run_orm.company_id,
            "run_id": run_id,
            "payload": {"status": "running"},
        })

        # Строим начальный state
        initial_state: AgentState = {
            "run_id": run_id,
            "company_id": str(run_orm.company_id),
            "input": run_orm.goal or (run_orm.task_id or ""),
            "messages": [],
            "pending_tasks": [],
            "active_tasks": {},
            "results": {},
            "iteration_count": 0,
            "total_tokens": 0,
            "total_cost_usd": 0.0,
            "status": "running",
            "error": None,
            "final_result": None,
            "agent_id": "ceo",
            "level": 0,
        }

        try:
            async with create_checkpointer("agentco.db") as checkpointer:
                compiled = compile_graph(checkpointer=checkpointer)
                config = {"configurable": {"thread_id": run_id}}
                final_state = await compiled.ainvoke(initial_state, config=config)

            result = final_state.get("final_result", "")
            final_status = final_state.get("status", "done")

            run_orm = self._session.get(self._repo.orm_model, run_id)
            if run_orm:
                run_orm.status = final_status if final_status in ("completed", "failed", "error") else "done"
                run_orm.result = result
                run_orm.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                self._session.commit()

            await bus.publish({
                "type": "run.completed",
                "company_id": run_orm.company_id if run_orm else "",
                "run_id": run_id,
                "payload": {"status": final_status, "result": result},
            })

            return result

        except Exception as exc:
            logger.error("execute_run failed for %s: %s", run_id, exc)
            run_orm = self._session.get(self._repo.orm_model, run_id)
            if run_orm:
                run_orm.status = "failed"
                run_orm.error = str(exc)
                run_orm.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                self._session.commit()

            await bus.publish({
                "type": "run.failed",
                "company_id": run_orm.company_id if run_orm else "",
                "run_id": run_id,
                "payload": {"error": str(exc)},
            })
            raise

    def stop(self, company_id: str, run_id: str, owner_id: str | None = None) -> Run:
        """Останавливает running ран."""
        if owner_id is not None:
            company = self._company_repo.get(company_id)
            if company.owner_id != owner_id:
                raise NotFoundError(f"Company {company_id!r} not found")

        # ALEX-TD-006 fix: don't swallow DB exceptions — only handle the missing-run case
        run_orm = self._session.get(self._repo.orm_model, run_id)

        if run_orm is None or run_orm.company_id != company_id:
            raise NotFoundError(f"Run {run_id!r} not found")

        # Отменяем asyncio task если есть
        bg_task = RunService._active_tasks.pop(run_id, None)
        if bg_task and not bg_task.done():
            bg_task.cancel()

        # Обновляем статус → stopped (независимо от текущего)
        run_orm.status = "stopped"
        run_orm.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self._session.flush()
        self._session.commit()

        return self._repo._to_domain(run_orm)
