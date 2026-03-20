import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, event, pool
from alembic import context

config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Allow overriding DB URL via environment variable (ALEX-POST-001).
# Priority: DATABASE_URL > AGENTCO_DB_URL > alembic.ini sqlalchemy.url
db_url = (
    os.environ.get("DATABASE_URL")
    or os.environ.get("AGENTCO_DB_URL")
    or config.get_main_option("sqlalchemy.url")
)
config.set_main_option("sqlalchemy.url", db_url)

target_metadata = None


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    if not db_url.startswith(("postgresql://", "postgres://")):
        @event.listens_for(connectable, "connect")
        def _set_sqlite_pragmas(dbapi_conn, _record):
            """Enable WAL + foreign keys on every new connection (SQLite only)."""
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA foreign_keys=ON;")
            cursor.close()

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # Required for SQLite ALTER TABLE support
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
