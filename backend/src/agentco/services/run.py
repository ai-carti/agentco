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
import os
import random
import time
from datetime import datetime, timezone


from typing import Callable, Optional

# ALEX-TD-075: max timeout for a single LangGraph ainvoke() call (seconds).
# Prevents zombie background tasks on LLM hang / deadlock.
# Configurable via MAX_RUN_TIMEOUT_SEC env var (default 600 = 10 minutes).
_MAX_RUN_TIMEOUT_SEC: int = int(os.getenv("MAX_RUN_TIMEOUT_SEC", "600"))

from sqlalchemy.orm import Session, sessionmaker

from ..models.run import Run, RunEvent
from ..repositories.run import RunRepository
from ..repositories.company import CompanyRepository
from ..repositories.task import TaskRepository
from ..repositories.base import NotFoundError, ConflictError
from ..core.event_bus import EventBus
# ALEX-TD-144: module-level imports so tests can patch agentco.services.run.*
from ..orchestration.graph import compile as compile_graph  # noqa: F401
from ..orchestration.checkpointer import create_checkpointer  # noqa: F401
from ..memory.service import MemoryService  # noqa: F401
from ..orchestration.agent_node import _memory_service_var  # noqa: F401

logger = logging.getLogger(__name__)


class RunService:
    # ALEX-TD-026: Intentional class-level (global) registry активных asyncio Tasks.
    # Хранится на уровне класса, не экземпляра, чтобы stop() мог отменить task
    # независимо от того какой экземпляр RunService вызывается (каждый HTTP request
    # создаёт новый экземпляр, но _active_tasks — общий для всех).
    # ВАЖНО: всегда обращайтесь через RunService._active_tasks, не через self._active_tasks,
    # чтобы не рисковать переопределить атрибут на уровне экземпляра.
    _active_tasks: dict[str, asyncio.Task] = {}  # run_id → asyncio.Task

    def __init__(self, session: Session) -> None:
        self._session = session
        self._repo = RunRepository(session)
        self._task_repo = TaskRepository(session)
        self._company_repo = CompanyRepository(session)

    def create_with_goal(
        self,
        company_id: str,
        goal: str,
        owner_id: str,
        session_factory: Optional[Callable[[], Session]] = None,
    ) -> Run:
        """Create a run with a goal and start it as a background task.

        ALEX-TD-126 fix: previously this method only created the Run record and
        returned — the run stayed in 'pending' forever because execute_run was
        never called. Now it spawns an asyncio background task that calls
        execute_run() after the DB commit, mirroring create_and_start().

        The session_factory parameter allows the background task to use a fresh
        DB session (required in async context to avoid detached-instance errors).
        If not provided, falls back to creating sessions without factory.
        """
        company = self._company_repo.get(company_id)
        if company.owner_id != owner_id:
            raise NotFoundError(f"Company {company_id!r} not found")

        # ALEX-TD-211: validate that goal is non-empty after stripping whitespace.
        # RunCreate Pydantic schema enforces min_length=1 at the API layer, but direct
        # callers (tests, webhooks, cron) bypass the handler → service must self-validate.
        if not goal.strip():
            raise ValueError("goal must not be empty")

        run = Run(
            company_id=company_id,
            goal=goal.strip(),
            status="pending",
            started_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        run = self._repo.add(run)
        self._session.commit()

        # ALEX-TD-126: Spawn background task to actually start execution.
        # Without this, run stays in 'pending' forever — agents never start.
        try:
            loop = asyncio.get_running_loop()
            bg_task = loop.create_task(
                self.execute_run(run.id, session_factory=session_factory)
            )
            RunService._active_tasks[run.id] = bg_task

            def _on_done(fut: asyncio.Task) -> None:
                RunService._active_tasks.pop(run.id, None)

            bg_task.add_done_callback(_on_done)

            # Publish run.started event
            loop.create_task(EventBus.get().publish({
                "type": "run.started",
                "company_id": company_id,
                "run_id": run.id,
                "payload": {"status": "pending", "goal": goal.strip()},
            }))
        except RuntimeError:
            # No running event loop (e.g. sync test context) — skip bg task.
            # In this case the caller is responsible for starting execution.
            logger.debug("create_with_goal: no running event loop, skipping bg task for run %s", run.id)

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

        # 5. Публикуем run.started + запускаем background task
        # ALEX-TD-134 fix: обёртка в try/except RuntimeError аналогично create_with_goal.
        # create_and_start ранее падал с RuntimeError в синхронном тестовом контексте
        # вместо graceful degradation.
        try:
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
        except RuntimeError:
            # No running event loop (e.g. sync test context) — skip bg task and event publish.
            logger.debug("create_and_start: no running event loop, skipping bg task for run %s", run.id)

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
        ALEX-TD-008 fix: wire _execute_agent to real execute_run() (LangGraph).

        Previously this was a stub that faked completion.
        Now delegates to execute_run() which runs the full LangGraph graph.
        session_factory is used to update run status — execute_run manages its own session.

        ALEX-TD-032 fix: do NOT duplicate error handling here. execute_run() already
        catches all exceptions, updates run status → 'failed', publishes run.failed event,
        then re-raises. Wrapping again would cause 2x run.failed events + 2x DB writes.

        ALEX-POST-007: retry wrapper — on transient failure retries up to MAX_RETRIES times
        with exponential backoff. Permanent errors (cost_limit_exceeded, token_limit_exceeded)
        are not retried.

        ALEX-TD-056: imports moved to module level (asyncio, os already imported at top).
        """
        # ALEX-TD-056: use module-level asyncio and os (no in-function import aliases)
        _MAX_RETRIES = int(os.getenv("RUN_MAX_RETRIES", "3"))
        # ALEX-TD-281: do NOT clamp _MAX_RETRIES to 1 here.
        # The old ALEX-TD-048 guard (`if _MAX_RETRIES < 1: _MAX_RETRIES = 1`) prevented
        # last_exc from staying None by forcing at least one loop iteration.
        # That masked the real bug: if the loop body never runs, `raise last_exc`
        # where last_exc=None produces `TypeError: exceptions must derive from BaseException`.
        # Fix: initialise last_exc to a clear RuntimeError so that even when the loop
        # does not execute (RUN_MAX_RETRIES=0), the caller gets a meaningful exception.
        _RETRY_BASE_DELAY = float(os.getenv("RUN_RETRY_BASE_DELAY", "1.0"))
        # ALEX-TD-146: removed "cancelled" from _NO_RETRY_ERRORS — it was dead code.
        # str(asyncio.CancelledError()) == '' → any("cancelled" in "" ...) == False → never matched.
        # CancelledError inherits BaseException, not Exception → not caught by 'except Exception'.
        # Explicit isinstance guard below handles CancelledError clearly.
        _NO_RETRY_ERRORS = {"cost_limit_exceeded", "token_limit_exceeded"}

        # ALEX-TD-281: initialise to a meaningful sentinel so `raise last_exc` never hits
        # the `raise None` → TypeError path when the loop body never executes (_MAX_RETRIES=0).
        last_exc: Exception = RuntimeError("no retries attempted")
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                # ALEX-TD-024: pass session_factory so execute_run uses a fresh session
                # for final DB update (avoids stale self._session in background task).
                result = await self.execute_run(run_id, session_factory=session_factory)
                return result
            except Exception as exc:
                # ALEX-TD-092: asyncio.TimeoutError must never be retried.
                # wait_for() raises TimeoutError when MAX_RUN_TIMEOUT_SEC is exceeded.
                # str(asyncio.TimeoutError()) == '' → matches nothing in _NO_RETRY_ERRORS
                # → without this guard, a timed-out run would be retried 3× = up to 30 min.
                if isinstance(exc, asyncio.TimeoutError):
                    raise
                # ALEX-TD-146: explicit CancelledError guard for clarity.
                # CancelledError is BaseException (not caught above), but guard makes intent clear.
                if isinstance(exc, asyncio.CancelledError):  # noqa: SIM102
                    raise
                error_code = getattr(exc, "error_code", None) or str(exc)
                # Don't retry permanent/intentional errors
                if any(no_retry in error_code for no_retry in _NO_RETRY_ERRORS):
                    raise
                last_exc = exc
                if attempt < _MAX_RETRIES:
                    delay = _RETRY_BASE_DELAY * (2 ** (attempt - 1))
                    # ALEX-TD-196: full jitter (0..delay) to avoid thundering herd.
                    # Previously added only 0-10% randomness — true full jitter
                    # distributes uniformly over [0, delay] for much better spread.
                    delay = random.uniform(0, delay)
                    logger.warning(
                        "run_retry run_id=%s company_id=%s attempt=%d/%d delay=%.2fs error=%s",
                        run_id, company_id, attempt, _MAX_RETRIES, delay, exc,
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        "run_dead_letter run_id=%s company_id=%s exhausted after %d attempts error=%s",
                        run_id, company_id, _MAX_RETRIES, exc,
                        exc_info=True,
                    )
        raise last_exc  # type: ignore[misc]

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

    def _list_by_company(self, company_id: str, limit: int = 100, offset: int = 0) -> list[Run]:
        """Внутренний метод: список ранов компании без проверки ownership.

        ALEX-TD-240: помечен как internal (_) — вызывать только из методов этого
        класса, которые сами проверяют ownership. Публичный доступ без ownership
        check создаёт риск утечки данных при рефакторинге. Используй
        list_by_company_owned() для внешних вызовов.
        """
        return self._repo.list_by_company(company_id, limit=limit, offset=offset)

    def list_by_company_owned(
        self,
        company_id: str,
        owner_id: str,
        limit: int = 100,
        offset: int = 0,
        status_filter: Optional[str] = None,
    ) -> list[Run]:
        """Список ранов компании — с проверкой ownership. Опциональный фильтр по статусу."""
        company = self._company_repo.get(company_id)
        if company.owner_id != owner_id:
            raise NotFoundError(f"Company {company_id!r} not found")
        return self._repo.list_by_company(company_id, limit=limit, offset=offset, status_filter=status_filter)

    def list_by_task_owned(
        self,
        company_id: str,
        task_id: str,
        owner_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Run]:
        """Список ранов задачи — с проверкой ownership. ALEX-TD-043: limit/offset pagination."""
        company = self._company_repo.get(company_id)
        if company.owner_id != owner_id:
            raise NotFoundError(f"Company {company_id!r} not found")
        try:
            task = self._task_repo.get(task_id)
        except NotFoundError:
            raise NotFoundError(f"Task {task_id!r} not found")
        if task.company_id != company_id:
            raise NotFoundError(f"Task {task_id!r} not found in company {company_id!r}")
        return self._repo.list_by_task(task_id, limit=limit, offset=offset)

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

    def list_events(
        self,
        company_id: str,
        run_id: str,
        owner_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[RunEvent]:
        """Events list for a run. Validates ownership. Supports pagination.

        ALEX-TD-249: replaced 2-step company_repo.get() + self.get() with a single
        get_owned() call — saves 1 DB round-trip per GET /runs/{id}/events request.
        """
        # Single JOIN query: validates run exists, belongs to company, and owner matches.
        self._repo.get_owned(run_id, company_id, owner_id)
        return self._repo.list_events(run_id, limit=limit, offset=offset)

    async def execute_run(
        self,
        run_id: str,
        session_factory: Optional[Callable[[], Session]] = None,
    ) -> str:
        """
        M2-002 AC: RunService.execute_run(run_id) запускает граф для конкретного рана.

        Загружает ран из БД, строит и запускает LangGraph граф через AsyncSqliteSaver checkpointer.
        Эмитирует события в EventBus при смене статуса агента.

        ALEX-TD-024: session_factory используется для финального DB update после закрытия
        checkpointer context. Если не передан — fallback на self._session (для прямых вызовов).

        ALEX-TD-025: session_factory должна быть plain callable () → Session (не contextmanager).
        Вызывающий код (handlers/runs.py:_session_ctx) переписан на обычную функцию.
        """
        # Use module-level aliases (imported at top of file) so tests can patch them.
        # compile_graph, create_checkpointer, MemoryService are already in scope via
        # module-level imports added for ALEX-TD-144 (test patchability).
        from ..orchestration.state import AgentState
        # ALEX-TD-150: single import of _run_mod — used for both graph helpers and ContextVar.
        # Previously imported twice (once here, once near ContextVar usage) — second was dead code.
        import agentco.services.run as _run_mod
        _compile_graph = _run_mod.compile_graph
        _create_checkpointer = _run_mod.create_checkpointer
        _MemoryService = _run_mod.MemoryService

        bus = EventBus.get()

        # ALEX-TD-028: используем session_factory для начального чтения и обновления статуса
        # если передан (background task context — self._session может быть detached).
        # Если session_factory не передан — используем self._session (прямой вызов в тестах).
        # ALEX-TD-030: инициализируем company_id до try-блока, чтобы избежать UnboundLocalError
        # в outer except-блоке если run не найден.
        company_id: str = ""
        _init_session = session_factory() if session_factory is not None else self._session
        try:
            run_orm = _init_session.get(self._repo.orm_model, run_id)
            if run_orm is None:
                raise ValueError(f"Run {run_id!r} not found")

            company_id = run_orm.company_id
            _initial_task_id = run_orm.task_id
            # ALEX-TD-204: when goal is None (task-based run), load task title+description
            # instead of falling back to task_id UUID string (LLM gets UUID → useless input).
            if run_orm.goal:
                initial_goal = run_orm.goal
            elif _initial_task_id:
                from ..orm.task import TaskORM as _TaskORM
                task_orm = _init_session.get(_TaskORM, _initial_task_id)
                if task_orm is not None:
                    task_desc = task_orm.description or ""
                    initial_goal = f"{task_orm.title}\n{task_desc}".strip() if task_desc else task_orm.title
                else:
                    initial_goal = _initial_task_id  # fallback: shouldn't happen
            else:
                initial_goal = ""

            # ALEX-TD-283: guard against empty goal — LLM cannot act on empty input.
            if not initial_goal.strip():
                raise ValueError(
                    f"Run {run_id!r} has no goal and no resolvable task — cannot start"
                )

            # Обновляем статус → running
            run_orm.status = "running"
            _init_session.commit()
        finally:
            if session_factory is not None:
                _init_session.close()

        await bus.publish({
            "type": "run.status_changed",
            "company_id": company_id,
            "run_id": run_id,
            "payload": {"status": "running"},
        })

        # ALEX-TD-144: create MemoryService for this run so agent_node can
        # inject past memories into system_prompt and save new memories.
        # Previously memory_service was never set → memory injection silently skipped.
        # Using AGENTCO_MEMORY_DB env var (mirrors handlers/memory.py convention).
        # ALEX-TD-148 fix: parse sqlite:/// URL if AGENTCO_DB_PATH contains a SQLAlchemy URL
        # (e.g. "sqlite:///./agentco.db"). sqlite3.connect() requires a plain file path,
        # not a SQLAlchemy URL → OperationalError: unable to open database file.
        _raw_memory_db = os.getenv("AGENTCO_MEMORY_DB", os.getenv("AGENTCO_MEMORY_DB_PATH", "./agentco_memory.db"))
        if _raw_memory_db.startswith("sqlite:///"):
            _memory_db = _raw_memory_db[len("sqlite:///"):]
        else:
            _memory_db = _raw_memory_db
        _memory_service = _MemoryService(_memory_db)

        # ALEX-TD-147 fix: do NOT put memory_service into initial_state.
        # LangGraph serializes state via msgpack at each checkpoint — MemoryService
        # (which holds a sqlite3 connection) is not msgpack serializable → TypeError
        # in _checkpointer_put_after_previous → run always fails at first checkpoint.
        # Fix: use contextvars.ContextVar (_memory_service_var) to make MemoryService
        # available to agent_node nodes during ainvoke without it ever entering
        # the serialized LangGraph state.
        # All async tasks created inside ainvoke inherit the current context.
        # ALEX-TD-150: reuse _run_mod imported above — no second import needed.
        _memory_service_var_ref = _run_mod._memory_service_var
        _ms_token = _memory_service_var_ref.set(_memory_service)

        # Строим начальный state (без memory_service)
        initial_state: AgentState = {
            "run_id": run_id,
            "company_id": str(company_id),
            "input": initial_goal,
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
            # ALEX-TD-277/280: expose max_depth so subagent/hierarchical nodes
            # don't rely on hardcoded default — configurable via MAX_AGENT_DEPTH env var.
            "max_depth": int(os.environ.get("MAX_AGENT_DEPTH", "2")),
        }

        def _get_session_for_update() -> Session:
            """Return a fresh session if factory available, else self._session."""
            if session_factory is not None:
                return session_factory()
            return self._session

        # ALEX-TD-273: track elapsed time for observability. Operators need to see
        # how long a run took in logs without querying the DB. time.monotonic() is
        # immune to clock adjustments (unlike datetime.now()) — safe for durations.
        _run_start_mono = time.monotonic()
        try:
            # ALEX-TD-063: use CHECKPOINT_DB_PATH (via get_checkpoint_db_path) instead of
            # AGENTCO_DB_PATH. Keeps checkpoints in a separate file from the main DB.
            async with _create_checkpointer() as checkpointer:
                compiled = _compile_graph(checkpointer=checkpointer)
                config = {"configurable": {"thread_id": run_id}}
                # ALEX-TD-075: wrap ainvoke in wait_for to prevent zombie tasks.
                # If LLM/network hangs indefinitely, asyncio.TimeoutError propagates
                # into the except block below → run.status = 'failed'.
                final_state = await asyncio.wait_for(
                    compiled.ainvoke(initial_state, config=config),
                    timeout=float(_MAX_RUN_TIMEOUT_SEC),
                )

            result = final_state.get("final_result", "")
            final_status = final_state.get("status", "done")

            # ALEX-TD-024: use fresh session for final update (checkpointer context is closed)
            # ALEX-TD-088: also persist total_tokens and total_cost_usd from final_state.
            # Previously these were never written to DB — GET /runs/{id} always returned 0.
            # BUG-DETACHED: initialize metric locals before try so logger.info always has values
            # even if run_orm is None or session raises an error.
            _log_tokens: int = int(final_state.get("total_tokens", 0))
            _log_cost: float = float(final_state.get("total_cost_usd", 0.0))
            update_session = _get_session_for_update()
            try:
                run_orm = update_session.get(self._repo.orm_model, run_id)
                if run_orm:
                    # ALEX-TD-209: guard against race condition where stop() already set
                    # status="stopped" between ainvoke() completing and this final update.
                    # stop() sets status="stopped" synchronously (no await) while the
                    # bg_task.cancel() propagates asynchronously — ainvoke may complete
                    # before CancelledError is processed. Without this guard, "stopped"
                    # would be silently overwritten with "done"/"completed".
                    _terminal = {"completed", "failed", "stopped", "done", "error"}
                    if run_orm.status not in _terminal:
                        run_orm.status = final_status if final_status in ("completed", "failed", "error") else "done"
                    elif run_orm.status == "stopped":
                        # Run was stopped concurrently — preserve "stopped", only update metrics.
                        logger.info(
                            "execute_run: run %s already stopped — preserving status, updating metrics",
                            run_id,
                        )
                    run_orm.result = result
                    run_orm.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    # ALEX-TD-088: persist accumulated token/cost metrics from LangGraph state
                    run_orm.total_tokens = final_state.get("total_tokens", 0)
                    run_orm.total_cost_usd = final_state.get("total_cost_usd", 0.0)
                    # ALEX-TD-193: persist error field when graph returns status=failed/error
                    # (loop_detected, cost_limit_exceeded, token_limit_exceeded).
                    # Without this, run_orm.error stays None in DB → frontend shows empty error field.
                    run_orm.error = final_state.get("error")
                    update_session.commit()
                    # ALEX-TD-268/271 + BUG-DETACHED: capture metrics BEFORE session.close().
                    # After session.close(), SQLAlchemy expires the ORM object — accessing
                    # run_orm.total_tokens raises DetachedInstanceError.
                    # Read the values while the session is still open (inside the try block).
                    _log_tokens = run_orm.total_tokens
                    _log_cost = run_orm.total_cost_usd
                else:
                    # BUG-068: run was deleted while graph was running — metrics are lost
                    logger.warning("execute_run: run_orm not found for run_id=%s, metrics lost", run_id)
                    _log_tokens = int(final_state.get("total_tokens", 0))
                    _log_cost = float(final_state.get("total_cost_usd", 0.0))
            finally:
                if session_factory is not None:
                    update_session.close()

            # ALEX-TD-268 + ALEX-TD-271: log successful run completion with metrics.
            # Observability gap: prod logs were silent on success — operators couldn't
            # distinguish "completed" from "hung" without querying the DB.
            # Include run_id, status, tokens, and cost so expensive runs are visible in logs.
            # ALEX-TD-273: include elapsed_sec so slow runs are visible in logs
            # without querying the DB (time.monotonic() set before ainvoke above).
            _elapsed_sec = round(time.monotonic() - _run_start_mono, 2)
            logger.info(
                "execute_run: run_id=%s completed status=%s company_id=%s tokens=%d cost=%.4f elapsed=%.2fs",
                run_id, final_status, company_id, _log_tokens, _log_cost, _elapsed_sec,
            )

            # ALEX-TD-084: publish run.failed when graph returns status=failed/error.
            # Previously run.completed was published regardless of final_status,
            # causing frontend to show "Run completed" for loop_detected/cost_limit_exceeded cases.
            if final_status in ("failed", "error"):
                await bus.publish({
                    "type": "run.failed",
                    "company_id": company_id,
                    "run_id": run_id,
                    "payload": {"status": final_status, "error": final_state.get("error")},
                })
            else:
                await bus.publish({
                    "type": "run.completed",
                    "company_id": company_id,
                    "run_id": run_id,
                    "payload": {"status": final_status, "result": result},
                })

            return result

        except Exception as exc:
            logger.error("execute_run failed for %s: %s", run_id, exc, exc_info=True)

            # ALEX-TD-024: use fresh session for error update too
            # ALEX-TD-104: initialize run_orm = None BEFORE inner try to prevent UnboundLocalError.
            # If update_session.get() raises OperationalError (disk full, DB down), the OperationalError
            # propagates out of the inner try/finally. Without pre-initialization, run_orm is unbound
            # → NameError at 'if run_orm is None' → 'await bus.publish(run.failed)' is never reached
            # → frontend stays stuck in 'running' state indefinitely.
            run_orm = None
            update_session = _get_session_for_update()
            try:
                run_orm = update_session.get(self._repo.orm_model, run_id)
                if run_orm:
                    run_orm.status = "failed"
                    run_orm.error = str(exc)
                    run_orm.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    update_session.commit()
            except Exception as db_exc:
                # ALEX-TD-104: catch DB errors so run.failed event is always published below.
                # ALEX-TD-253: added exc_info=True so stacktrace is visible in production logs.
                logger.warning(
                    "execute_run: DB update failed in error branch for run_id=%s: %s",
                    run_id, db_exc,
                    exc_info=True,
                )
            finally:
                if session_factory is not None:
                    update_session.close()

            if run_orm is None:
                # BUG-071: run was deleted while graph was failing — log the loss
                logger.warning("execute_run: run_orm not found for run_id=%s in error branch, status update lost", run_id)

            await bus.publish({
                "type": "run.failed",
                "company_id": company_id,
                "run_id": run_id,
                "payload": {"error": str(exc)},
            })
            raise
        finally:
            # ALEX-TD-147: always reset ContextVar and close MemoryService after run.
            # Prevents MemoryService leaking between concurrent runs (each run has its
            # own sqlite connection and must be closed to avoid file descriptor leaks).
            _memory_service_var_ref.reset(_ms_token)
            try:
                _memory_service.close()
            except Exception as e:
                logger.warning("MemoryService.close() failed for run %s: %s", run_id, e)

    def stop(self, company_id: str, run_id: str, owner_id: str | None = None) -> Run:
        """Останавливает running ран.

        ALEX-TD-033 fix: если ран уже в terminal state (completed/failed/stopped/done),
        возвращаем как есть — не перезаписываем финальный статус.
        """
        if owner_id is not None:
            company = self._company_repo.get(company_id)
            if company.owner_id != owner_id:
                raise NotFoundError(f"Company {company_id!r} not found")

        # ALEX-TD-006 fix: don't swallow DB exceptions — only handle the missing-run case
        run_orm = self._session.get(self._repo.orm_model, run_id)

        if run_orm is None or run_orm.company_id != company_id:
            raise NotFoundError(f"Run {run_id!r} not found")

        # ALEX-TD-033: если ран уже в terminal state — не меняем статус
        # ALEX-TD-099: "error" is also terminal — graph completed with status=error (loop/cost limit)
        _terminal = {"completed", "failed", "stopped", "done", "error"}
        if run_orm.status in _terminal:
            return self._repo._to_domain(run_orm)

        # Отменяем asyncio task если есть
        bg_task = RunService._active_tasks.pop(run_id, None)
        if bg_task and not bg_task.done():
            bg_task.cancel()

        # Обновляем статус → stopped
        run_orm.status = "stopped"
        run_orm.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self._session.commit()

        # ALEX-TD-045: публикуем run.stopped в EventBus
        # stop() вызывается из async HTTP handler — loop всегда running.
        try:
            loop = asyncio.get_running_loop()
            bus = EventBus.get()
            loop.create_task(bus.publish({
                "type": "run.stopped",
                "company_id": company_id,
                "run_id": run_id,
                "payload": {"status": "stopped"},
            }))
        except RuntimeError:
            # Нет running loop (например, синхронные тесты) — пропускаем publish.
            pass

        return self._repo._to_domain(run_orm)
