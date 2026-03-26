"""
Test for ALEX-TD-229: timing attack prevention for email enumeration in login.

The test verifies that login response time for a non-existent email is
comparable to login response time for an existing email with wrong password.
Both paths must run bcrypt (~100ms) to prevent timing-based email enumeration.
"""
from __future__ import annotations

import time
import pytest


class TestLoginTimingAttack:
    """ALEX-TD-229: login must not leak email existence via response time."""

    def test_login_timing_attack_nonexistent_vs_wrong_password(self, auth_client):
        """
        Response time for non-existent email must be comparable to wrong-password response.
        Both paths must call bcrypt verify_password — otherwise timing delta reveals
        whether an email is registered.

        Implementation uses verify_password spy to confirm bcrypt is always called.
        """
        from unittest.mock import patch
        import agentco.handlers.auth as auth_handler
        from agentco.auth import security as sec_module

        client, _ = auth_client

        # Register a user
        client.post("/auth/register", json={"email": "timing_test@example.com", "password": "correct1234"})

        # Track bcrypt calls
        call_counts = {"nonexistent": 0, "existing": 0}
        original_verify = sec_module.verify_password

        def spy_nonexistent(plain, hashed):
            call_counts["nonexistent"] += 1
            return original_verify(plain, hashed)

        def spy_existing(plain, hashed):
            call_counts["existing"] += 1
            return original_verify(plain, hashed)

        # Path 1: non-existent email
        with patch.object(auth_handler, "verify_password", side_effect=spy_nonexistent):
            resp1 = client.post(
                "/auth/login",
                json={"email": "doesnotexist@example.com", "password": "somepass"},
            )
        assert resp1.status_code == 401

        # Path 2: existing email, wrong password
        with patch.object(auth_handler, "verify_password", side_effect=spy_existing):
            resp2 = client.post(
                "/auth/login",
                json={"email": "timing_test@example.com", "password": "wrongpass"},
            )
        assert resp2.status_code == 401

        # Both paths must call verify_password (bcrypt)
        assert call_counts["nonexistent"] >= 1, (
            "ALEX-TD-229: verify_password must be called even for non-existent email. "
            "Otherwise timing attack reveals email existence."
        )
        assert call_counts["existing"] >= 1, (
            "verify_password must be called for existing user with wrong password."
        )

    def test_dummy_hash_used_for_nonexistent_user(self, auth_client):
        """
        When user is not found, DUMMY_HASH from security module is used as the
        candidate hash — ensuring bcrypt runs the full comparison.
        """
        from agentco.auth.security import DUMMY_HASH, verify_password

        client, _ = auth_client

        # DUMMY_HASH must be a valid bcrypt hash
        assert DUMMY_HASH.startswith("$2"), f"DUMMY_HASH must be bcrypt, got: {DUMMY_HASH[:15]}"

        # Verifying any password against DUMMY_HASH must return False (not raise)
        result = verify_password("any-attacker-password", DUMMY_HASH)
        assert result is False

    def test_login_nonexistent_email_returns_401(self, auth_client):
        """Non-existent email must return 401 (not 404 or 500)."""
        client, _ = auth_client
        resp = client.post(
            "/auth/login",
            json={"email": "ghost@example.com", "password": "password123"},
        )
        assert resp.status_code == 401

    def test_login_existing_email_wrong_password_returns_401(self, auth_client):
        """Existing email + wrong password must return 401."""
        client, _ = auth_client
        client.post("/auth/register", json={"email": "real@example.com", "password": "real1234"})
        resp = client.post(
            "/auth/login",
            json={"email": "real@example.com", "password": "wrong1234"},
        )
        assert resp.status_code == 401

    def test_login_valid_credentials_still_work(self, auth_client):
        """Regression: timing fix must not break valid login."""
        client, _ = auth_client
        client.post("/auth/register", json={"email": "valid2@example.com", "password": "valid1234"})
        resp = client.post(
            "/auth/login",
            json={"email": "valid2@example.com", "password": "valid1234"},
        )
        assert resp.status_code == 200
        assert "access_token" in resp.json()
