"""
M1-001: Auth JWT — register/login endpoints.

TDD: тесты написаны первыми (red), потом реализация (green).

Run: uv run pytest tests/test_auth.py -v
"""
import pytest
from sqlalchemy.orm import sessionmaker


# ── AC1: POST /auth/register → 201, возвращает user id ───────────────────────

def test_register_returns_201(auth_client):
    client, _ = auth_client
    response = client.post(
        "/auth/register",
        json={"email": "test@example.com", "password": "secret123"},
    )
    assert response.status_code == 201


def test_register_returns_user_id(auth_client):
    client, _ = auth_client
    response = client.post(
        "/auth/register",
        json={"email": "test@example.com", "password": "secret123"},
    )
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert len(data["id"]) > 0


# ── AC2: POST /auth/login → 200, access_token + token_type ───────────────────

def test_login_returns_200(auth_client):
    client, _ = auth_client
    client.post("/auth/register", json={"email": "user@example.com", "password": "pass123"})
    response = client.post("/auth/login", json={"email": "user@example.com", "password": "pass123"})
    assert response.status_code == 200


def test_login_returns_access_token(auth_client):
    client, _ = auth_client
    client.post("/auth/register", json={"email": "user@example.com", "password": "pass123"})
    response = client.post("/auth/login", json={"email": "user@example.com", "password": "pass123"})
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert len(data["access_token"]) > 10


# ── AC3: Неверный пароль → 401 ────────────────────────────────────────────────

def test_login_wrong_password_returns_401(auth_client):
    client, _ = auth_client
    client.post("/auth/register", json={"email": "user@example.com", "password": "correct"})
    response = client.post("/auth/login", json={"email": "user@example.com", "password": "wrong"})
    assert response.status_code == 401


# ── AC4: Несуществующий юзер → 401 ───────────────────────────────────────────

def test_login_nonexistent_user_returns_401(auth_client):
    client, _ = auth_client
    response = client.post("/auth/login", json={"email": "nobody@example.com", "password": "pass123"})
    assert response.status_code == 401


# ── AC5: Защищённый endpoint с валидным token → 200 ──────────────────────────

def test_protected_endpoint_with_valid_token_returns_200(auth_client):
    client, _ = auth_client
    client.post("/auth/register", json={"email": "user@example.com", "password": "pass123"})
    login_resp = client.post("/auth/login", json={"email": "user@example.com", "password": "pass123"})
    token = login_resp.json()["access_token"]
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200


# ── AC6: Защищённый endpoint без token → 401 ─────────────────────────────────

def test_protected_endpoint_without_token_returns_401(auth_client):
    client, _ = auth_client
    response = client.get("/auth/me")
    assert response.status_code == 401


# ── AC7: Пароль хранится хэшированным ────────────────────────────────────────

def test_password_is_hashed_not_plaintext(auth_client):
    """Пароль в БД — bcrypt hash, не plaintext."""
    client, engine = auth_client
    from agentco.orm.user import User as UserORM

    plain_password = "plaintext_check"
    client.post("/auth/register", json={"email": "user@example.com", "password": plain_password})

    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        user = session.query(UserORM).filter_by(email="user@example.com").first()
        assert user is not None
        assert user.hashed_password != plain_password
        assert user.hashed_password.startswith("$2b$")  # bcrypt prefix
    finally:
        session.close()
