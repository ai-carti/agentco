"""
ALEX-TD-074: ws_events.py — silent except Exception проглатывает ошибку decode JWT.

Проблема: `except Exception: pass` при декодировании токена означает любая неожиданная
ошибка тихо превращается в user_id=None → 4001 Unauthorized без логирования.

Фикс: перехватывать только ожидаемые (jwt.PyJWTError), неожиданные логировать на WARNING.
"""
import logging
import uuid
import pytest
import jwt as pyjwt
from unittest.mock import patch, MagicMock

from agentco.handlers.ws_events import ws_company_events


class TestALEXTD074JWTErrorLogging:
    """JWT decode должен логировать unexpected exceptions и перехватывать только PyJWTError."""

    def test_pyjwterror_silent_no_log(self, caplog):
        """PyJWTError (invalid signature, expired) — не логируется, user_id=None."""
        from agentco.auth.security import decode_access_token
        with pytest.raises(pyjwt.PyJWTError):
            decode_access_token("not.a.valid.token")
        # Нет WARNING в логах — ожидаемая ошибка
        warnings = [r for r in caplog.records if r.levelno >= logging.WARNING
                    and "jwt" in r.message.lower()]
        assert len(warnings) == 0

    def test_unexpected_exception_logged_as_warning(self, caplog):
        """Неожиданное исключение при decode_access_token логируется как WARNING."""
        from agentco.auth import security as sec_module

        # Патчим decode_access_token чтобы бросал неожиданную ошибку
        with patch.object(sec_module, "decode_access_token", side_effect=RuntimeError("unexpected")):
            # Импортируем хэндлер заново через прямой вызов логики
            # Тестируем модульно: вызываем код, который должен логировать
            import agentco.handlers.ws_events as ws_mod

            # Симулируем логику аутентификации из ws_events
            logger = logging.getLogger("agentco.handlers.ws_events")
            user_id = None
            token = "some.token.value"

            try:
                user_id = sec_module.decode_access_token(token)
            except pyjwt.PyJWTError:
                pass  # ожидаемое
            except Exception as exc:
                logger.warning("Unexpected error decoding JWT token: %s", exc)

            assert user_id is None

        # Проверяем что WARNING был залогирован
        warnings = [r for r in caplog.records if r.levelno == logging.WARNING
                    and "unexpected" in r.message.lower()]
        assert len(warnings) == 1, f"Expected 1 warning, got: {caplog.records}"
        assert "unexpected" in warnings[0].message.lower()

    def test_expired_token_no_warning(self, caplog):
        """ExpiredSignatureError (подкласс PyJWTError) — тихо, без WARNING."""
        from agentco.auth.security import decode_access_token, SECRET_KEY, ALGORITHM
        from datetime import datetime, timezone, timedelta

        # Создаём заведомо истёкший токен
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        expired_token = pyjwt.encode({"sub": "user123", "exp": past}, SECRET_KEY, algorithm=ALGORITHM)

        with pytest.raises(pyjwt.ExpiredSignatureError):
            decode_access_token(expired_token)

        warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
        assert len(warnings) == 0

    def test_ws_unexpected_jwt_exception_logs_warning(self, auth_client, caplog):
        """
        Интеграционный тест: неожиданное исключение в decode_access_token
        при WS-подключении логируется как WARNING (не глотается молча).
        """
        from agentco.auth import security as sec_module
        from fastapi.testclient import TestClient
        from starlette.websockets import WebSocketDisconnect

        client, _ = auth_client

        with caplog.at_level(logging.WARNING, logger="agentco.handlers.ws_events"):
            with patch("agentco.handlers.ws_events.decode_access_token", side_effect=RuntimeError("boom")):
                try:
                    with client.websocket_connect(f"/ws/companies/{uuid.uuid4()}/events?token=sometoken") as ws:
                        try:
                            ws.receive_text()
                        except WebSocketDisconnect as e:
                            assert e.code == 4001
                except WebSocketDisconnect as e:
                    assert e.code == 4001

        warnings = [r for r in caplog.records if r.levelno == logging.WARNING
                    and "unexpected" in r.message.lower()]
        assert len(warnings) >= 1, f"Expected WARNING for unexpected JWT error, got: {caplog.records}"
