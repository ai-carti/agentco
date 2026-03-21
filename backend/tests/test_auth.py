"""
M1-001: Auth JWT — register/login endpoints.

TDD: тесты написаны первыми (red), потом реализация (green).

Run: uv run pytest tests/test_auth.py -v
"""
import pytest
from sqlalchemy.orm import sessionmaker


# ── Bug #1: Пароль > 72 байт → должен вернуть 422, не 500 ──────────────────

def test_register_password_over_72_bytes_returns_422(auth_client):
    """bcrypt v5 бросает ValueError для паролей > 72 байт. Должны вернуть 422."""
    client, _ = auth_client
    long_password = "a" * 73  # 73 байта — больше лимита bcrypt
    response = client.post(
        "/auth/register",
        json={"email": "longpass@example.com", "password": long_password},
    )
    assert response.status_code == 422


def test_register_password_exactly_72_bytes_returns_201(auth_client):
    """Пароль ровно 72 байта должен проходить."""
    client, _ = auth_client
    ok_password = "a" * 72
    response = client.post(
        "/auth/register",
        json={"email": "exact72@example.com", "password": ok_password},
    )
    assert response.status_code == 201


# ── Bug #2: Пустой email не должен приниматься → 422 ────────────────────────

def test_register_empty_email_returns_422(auth_client):
    """Пустой email должен отклоняться с 422."""
    client, _ = auth_client
    response = client.post(
        "/auth/register",
        json={"email": "", "password": "secret123"},
    )
    assert response.status_code == 422


def test_register_invalid_email_returns_422(auth_client):
    """Невалидный email должен отклоняться с 422."""
    client, _ = auth_client
    response = client.post(
        "/auth/register",
        json={"email": "not-an-email", "password": "secret123"},
    )
    assert response.status_code == 422


# ── Bug #3: Пустой пароль не должен приниматься → 422 ───────────────────────

def test_register_empty_password_returns_422(auth_client):
    """Пустой пароль при регистрации должен отклоняться с 422."""
    client, _ = auth_client
    response = client.post(
        "/auth/register",
        json={"email": "user@example.com", "password": ""},
    )
    assert response.status_code == 422


def test_login_empty_password_returns_401(auth_client):
    """Вход с пустым паролем должен возвращать 401."""
    client, _ = auth_client
    client.post("/auth/register", json={"email": "user@example.com", "password": "correct"})
    response = client.post("/auth/login", json={"email": "user@example.com", "password": ""})
    assert response.status_code == 401


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
    from agentco.orm.user import UserORM
    from sqlalchemy import select

    plain_password = "plaintext_check"
    client.post("/auth/register", json={"email": "user@example.com", "password": plain_password})

    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        user = session.scalars(select(UserORM).where(UserORM.email == "user@example.com")).first()
        assert user is not None
        assert user.hashed_password != plain_password
        assert user.hashed_password.startswith("$2b$")  # bcrypt prefix
    finally:
        session.close()
