"""
ALEX-TD-182: CredentialCreate.provider missing max_length constraint
ALEX-TD-183: silent except Exception in rate_limiting._key_identifier
"""
import inspect
import logging
import pytest
from pydantic import ValidationError


# ── ALEX-TD-182: CredentialCreate.provider max_length ────────────────────────

class TestALEXTD182CredentialProviderMaxLength:
    """CredentialCreate.provider должен иметь max_length=50."""

    def test_credential_create_provider_has_field_constraint(self):
        """provider должен быть объявлен через Field() с max_length."""
        from agentco.handlers.credentials import CredentialCreate
        import pydantic
        schema = CredentialCreate.model_json_schema()
        provider_schema = schema.get("properties", {}).get("provider", {})
        assert "maxLength" in provider_schema, (
            "ALEX-TD-182: CredentialCreate.provider must have maxLength in JSON schema. "
            "Add Field(max_length=50) to provider field."
        )

    def test_credential_create_provider_max_length_value(self):
        """max_length должен быть 50 (consistent with ValidateKeyRequest.provider)."""
        from agentco.handlers.credentials import CredentialCreate
        schema = CredentialCreate.model_json_schema()
        provider_schema = schema.get("properties", {}).get("provider", {})
        assert provider_schema.get("maxLength") == 50, (
            f"ALEX-TD-182: CredentialCreate.provider.maxLength should be 50, "
            f"got {provider_schema.get('maxLength')}. "
            "ValidateKeyRequest.provider already uses max_length=50 (ALEX-TD-115)."
        )

    def test_credential_create_provider_oversized_rejected(self, auth_client):
        """Строка 100 символов → 422 (Unprocessable Entity)."""
        client, _ = auth_client
        from tests.test_credentials import _register_and_login, _create_company, _auth_headers
        token = _register_and_login(client, email="oversized_provider@example.com")
        company_id = _create_company(client, token)

        resp = client.post(
            f"/api/companies/{company_id}/credentials",
            headers=_auth_headers(token),
            json={"provider": "a" * 100, "api_key": "sk-test-key"},
        )
        assert resp.status_code == 422, (
            f"ALEX-TD-182: 100-char provider should return 422, got {resp.status_code}. "
            "Add Field(max_length=50) to CredentialCreate.provider."
        )

    def test_credential_create_provider_valid_length_accepted(self, auth_client):
        """Валидный provider (short known name) по-прежнему проходит."""
        client, _ = auth_client
        from tests.test_credentials import _register_and_login, _create_company, _auth_headers
        token = _register_and_login(client, email="valid_provider@example.com")
        company_id = _create_company(client, token)

        resp = client.post(
            f"/api/companies/{company_id}/credentials",
            headers=_auth_headers(token),
            json={"provider": "openai", "api_key": "sk-test-key-valid"},
        )
        # 201 = created, 409 = duplicate (both are fine — not 422)
        assert resp.status_code in (201, 409), (
            f"ALEX-TD-182: valid provider 'openai' should not be rejected by max_length, "
            f"got {resp.status_code}"
        )


# ── ALEX-TD-183: silent except in rate_limiting._key_identifier ──────────────

class TestALEXTD183SilentExceptRateLimiting:
    """_key_identifier должен логировать неожиданные JWT ошибки."""

    def test_key_identifier_source_has_logging_on_exception(self):
        """В ветке except Exception должен быть вызов logger (не просто pass)."""
        from agentco.core import rate_limiting
        src = inspect.getsource(rate_limiting)

        # Find the _key_identifier function source block
        # We expect something like: logger.debug(...) before or replacing the bare pass
        # The function should NOT have a bare 'pass' without any logging call
        assert "logger." in src, (
            "ALEX-TD-183: rate_limiting module must use logger for exception handling "
            "in _key_identifier. Add logger.debug() in except Exception block."
        )

    def test_key_identifier_logs_unexpected_exception(self, caplog):
        """При неожиданной JWT ошибке — должен логироваться DEBUG/WARNING."""
        from unittest.mock import MagicMock, patch
        from agentco.core.rate_limiting import _get_rate_limit_key

        request = MagicMock()
        request.headers = {"Authorization": "Bearer some.valid.looking.token"}

        with patch("agentco.auth.security.decode_access_token",
                   side_effect=RuntimeError("unexpected pyjwt error")):
            with caplog.at_level(logging.DEBUG, logger="agentco.core.rate_limiting"):
                result = _get_rate_limit_key(request)

        # Should fall back to IP (not crash)
        assert result is not None

        # Should have logged something about the unexpected error
        assert any("unexpected" in r.message.lower() or "jwt" in r.message.lower()
                   for r in caplog.records), (
            "ALEX-TD-183: _get_rate_limit_key must log unexpected JWT errors. "
            "Add logger.debug('Unexpected JWT error in _get_rate_limit_key: %s', exc) before pass."
        )
