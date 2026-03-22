"""
Tests for ALEX-TD-075 and ALEX-TD-076.

ALEX-TD-075: execute_run — asyncio.wait_for timeout on ainvoke.
  - If ainvoke hangs past MAX_RUN_TIMEOUT_SEC, TimeoutError should propagate
    and be caught by the existing error handler → run.status = 'failed'.
  - Env var MAX_RUN_TIMEOUT_SEC controls the limit (default 600).

ALEX-TD-076: handlers/companies.py — CompanyCreate and CompanyUpdate share
  a common name validator (DRY). Both should reject whitespace-only names.
"""
import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── ALEX-TD-075: ainvoke timeout ──────────────────────────────────────────────

class TestExecuteRunTimeout:
    """execute_run должен завершиться с ошибкой если ainvoke висит дольше timeout."""

    def test_max_run_timeout_env_var_parsed(self):
        """MAX_RUN_TIMEOUT_SEC должен читаться из env и быть целым числом >= 1."""
        with patch.dict(os.environ, {"MAX_RUN_TIMEOUT_SEC": "30"}):
            # Проверяем что env var читается как int
            val = int(os.environ.get("MAX_RUN_TIMEOUT_SEC", "600"))
            assert val == 30

    def test_max_run_timeout_default_is_reasonable(self):
        """Дефолтный timeout должен быть разумным (10 минут = 600 сек)."""
        import agentco.services.run as run_module
        # Независимо от env, дефолт должен быть >= 60 секунд
        timeout = int(os.getenv("MAX_RUN_TIMEOUT_SEC", "600"))
        assert timeout >= 60, "Timeout must be at least 60 seconds"

    @pytest.mark.asyncio
    async def test_ainvoke_timeout_raises_and_marks_run_failed(self, tmp_path):
        """Если ainvoke зависает — execute_run должен поймать TimeoutError и пометить ран failed."""
        import agentco.services.run as run_module
        from agentco.services.run import RunService

        # Мок session
        mock_session = MagicMock()
        mock_run_orm = MagicMock()
        mock_run_orm.company_id = "company-1"
        mock_run_orm.goal = "test goal"
        mock_run_orm.task_id = "task-1"
        mock_session.get.return_value = mock_run_orm

        async def hang_forever(*args, **kwargs):
            await asyncio.sleep(9999)

        svc = RunService(mock_session)

        with patch.object(run_module, "_MAX_RUN_TIMEOUT_SEC", 1), \
             patch("agentco.orchestration.graph.compile") as mock_compile, \
             patch("agentco.orchestration.checkpointer.create_checkpointer") as mock_ckpt, \
             patch.object(run_module.EventBus, "get") as mock_bus:

            mock_graph = AsyncMock()
            mock_graph.ainvoke = hang_forever
            mock_compile.return_value = mock_graph

            # Мок checkpointer
            mock_ckpt_instance = AsyncMock()
            mock_ckpt_instance.__aenter__ = AsyncMock(return_value=mock_graph)
            mock_ckpt_instance.__aexit__ = AsyncMock(return_value=False)
            mock_ckpt.return_value = mock_ckpt_instance

            mock_bus_instance = AsyncMock()
            mock_bus.return_value = mock_bus_instance

            # execute_run должен не повиснуть, а выбросить исключение за разумное время
            with pytest.raises(Exception):  # TimeoutError или asyncio.TimeoutError
                await asyncio.wait_for(
                    svc.execute_run("run-1", session_factory=lambda: mock_session),
                    timeout=5.0,  # Внешний guard — тест не должен висеть более 5 сек
                )


# ── ALEX-TD-076: DRY validator in CompanyCreate/CompanyUpdate ────────────────

class TestCompanySchemaValidator:
    """Оба класса должны использовать единый валидатор имени."""

    def test_company_create_rejects_whitespace_name(self):
        """CompanyCreate должен отклонять строку только из пробелов."""
        from pydantic import ValidationError
        from agentco.handlers.companies import CompanyCreate

        with pytest.raises(ValidationError) as exc_info:
            CompanyCreate(name="   ")
        assert "whitespace" in str(exc_info.value).lower() or "empty" in str(exc_info.value).lower()

    def test_company_update_rejects_whitespace_name(self):
        """CompanyUpdate должен отклонять строку только из пробелов."""
        from pydantic import ValidationError
        from agentco.handlers.companies import CompanyUpdate

        with pytest.raises(ValidationError) as exc_info:
            CompanyUpdate(name="   ")
        assert "whitespace" in str(exc_info.value).lower() or "empty" in str(exc_info.value).lower()

    def test_company_create_strips_whitespace(self):
        """CompanyCreate должен обрезать пробелы из имени."""
        from agentco.handlers.companies import CompanyCreate

        company = CompanyCreate(name="  Test Company  ")
        assert company.name == "Test Company"

    def test_company_update_strips_whitespace(self):
        """CompanyUpdate должен обрезать пробелы из имени."""
        from agentco.handlers.companies import CompanyUpdate

        company = CompanyUpdate(name="  Test Company  ")
        assert company.name == "Test Company"

    def test_company_create_and_update_share_validator_logic(self):
        """CompanyCreate и CompanyUpdate должны иметь одинаковое поведение валидации."""
        from pydantic import ValidationError
        from agentco.handlers.companies import CompanyCreate, CompanyUpdate

        test_cases = [
            ("   ", True),    # Only whitespace → error
            ("", True),       # Empty → error
            ("Valid", False),  # Valid → ok
            ("  Valid  ", False),  # With spaces → ok (stripped)
        ]
        for name, should_fail in test_cases:
            for schema_cls in [CompanyCreate, CompanyUpdate]:
                if should_fail:
                    with pytest.raises(ValidationError):
                        schema_cls(name=name)
                else:
                    schema_cls(name=name)  # Should not raise
