"""
TDD тест для ALEX-TD-267: data migration email normalization.

Проверяет что Alembic миграция 0021 корректно нормализует
существующие mixed-case email адреса в таблице users к lowercase.

Run: uv run pytest tests/test_alex_td_267_migration.py -v
"""
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


def _make_bare_engine():
    """Создаём голый in-memory SQLite без ORM metadata — имитируем "до миграции"."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    return engine


class TestAlexTD267EmailNormalizationMigration:
    """
    ALEX-TD-267: миграция 0021 нормализует существующие email к lowercase.

    Сценарий: пользователи зарегистрированы до ALEX-TD-265 с mixed-case email.
    После деплоя login ищет email.lower(), но в БД хранится оригинальный регистр.
    Миграция 0021 выполняет UPDATE users SET email = LOWER(email).
    """

    def test_migration_sql_lowercases_emails(self):
        """Проверяем что SQL из миграции корректно нормализует email."""
        engine = _make_bare_engine()
        with engine.connect() as conn:
            # Создаём таблицу users (минимальная схема)
            conn.execute(text("""
                CREATE TABLE users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    hashed_password TEXT NOT NULL
                )
            """))
            # Вставляем пользователей с mixed-case email (до деплоя ALEX-TD-265)
            conn.execute(text("""
                INSERT INTO users (id, email, hashed_password) VALUES
                ('u1', 'Test@Example.COM', 'hash1'),
                ('u2', 'User@DOMAIN.ORG', 'hash2'),
                ('u3', 'already@lowercase.com', 'hash3'),
                ('u4', 'ALLCAPS@EXAMPLE.COM', 'hash4')
            """))
            conn.commit()

            # Применяем SQL из миграции 0021
            conn.execute(text("UPDATE users SET email = LOWER(email)"))
            conn.commit()

            # Проверяем результат
            rows = conn.execute(text("SELECT id, email FROM users ORDER BY id")).fetchall()

        assert len(rows) == 4
        assert rows[0].email == "test@example.com", f"Expected lowercase, got: {rows[0].email}"
        assert rows[1].email == "user@domain.org", f"Expected lowercase, got: {rows[1].email}"
        assert rows[2].email == "already@lowercase.com", f"Already lowercase should not change"
        assert rows[3].email == "allcaps@example.com", f"Expected lowercase, got: {rows[3].email}"

    def test_migration_module_exists(self):
        """Alembic миграция 0021 должна существовать."""
        import importlib
        import pkgutil
        import os

        versions_dir = os.path.join(
            os.path.dirname(__file__),
            "..", "alembic", "versions"
        )
        versions_dir = os.path.abspath(versions_dir)

        # Ищем файл миграции 0021
        migration_files = [
            f for f in os.listdir(versions_dir)
            if f.startswith("0021") and f.endswith(".py")
        ]
        assert len(migration_files) == 1, (
            f"ALEX-TD-267: ожидается ровно один файл миграции 0021_*.py, "
            f"найдено: {migration_files}. "
            f"Создайте alembic/versions/0021_email_normalize_alex_td_267.py"
        )

    def test_migration_0021_has_correct_sql(self):
        """Файл миграции 0021 должен содержать UPDATE email = LOWER(email)."""
        import os
        import importlib.util

        versions_dir = os.path.abspath(os.path.join(
            os.path.dirname(__file__), "..", "alembic", "versions"
        ))
        migration_files = [
            f for f in os.listdir(versions_dir)
            if f.startswith("0021") and f.endswith(".py")
        ]
        assert migration_files, "Migration 0021 not found"

        path = os.path.join(versions_dir, migration_files[0])
        with open(path) as f:
            source = f.read()

        assert "LOWER(email)" in source or "lower(email)" in source, (
            "ALEX-TD-267: миграция 0021 должна содержать UPDATE с LOWER(email). "
            f"Содержимое файла не содержит 'LOWER(email)'. Файл: {path}"
        )

    def test_migration_0021_revises_0020(self):
        """Миграция 0021 должна ссылаться на 0020 как down_revision."""
        import os

        versions_dir = os.path.abspath(os.path.join(
            os.path.dirname(__file__), "..", "alembic", "versions"
        ))
        migration_files = [
            f for f in os.listdir(versions_dir)
            if f.startswith("0021") and f.endswith(".py")
        ]
        assert migration_files, "Migration 0021 not found"

        path = os.path.join(versions_dir, migration_files[0])
        with open(path) as f:
            source = f.read()

        assert 'down_revision = "0020"' in source or "down_revision = '0020'" in source, (
            "ALEX-TD-267: миграция 0021 должна иметь down_revision='0020'. "
            f"Содержимое файла не содержит down_revision = '0020'."
        )

    def test_login_after_migration_works_with_lowercase(self, auth_client):
        """После нормализации пользователь с mixed-case email может войти через lowercase."""
        client, engine = auth_client

        # Симулируем: пользователь зарегистрировался с mixed-case до ALEX-TD-265
        # Напрямую пишем в БД обходя handler (который теперь делает .lower())
        from sqlalchemy import text as sql_text
        from agentco.auth.security import hash_password

        with engine.connect() as conn:
            conn.execute(sql_text(
                "INSERT INTO users (id, email, hashed_password, has_completed_onboarding) "
                "VALUES ('legacy-u1', 'OldUser@Example.COM', :pw, 0)"
            ), {"pw": hash_password("password123")})
            conn.commit()

            # Применяем миграцию (нормализация)
            conn.execute(sql_text("UPDATE users SET email = LOWER(email)"))
            conn.commit()

        # После миграции login с lowercase должен работать
        resp = client.post("/auth/login", json={
            "email": "olduser@example.com",
            "password": "password123"
        })
        assert resp.status_code == 200, (
            f"ALEX-TD-267: после email normalization migration, "
            f"login с lowercase должен работать. Got: {resp.status_code} {resp.json()}"
        )
        assert "access_token" in resp.json()
