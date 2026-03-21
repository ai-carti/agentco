"""
AgentCo CLI — управление сервером.

Commands:
    agentco start   — запустить сервер (production)
    agentco dev     — запустить сервер в dev-режиме с hot-reload
"""
import typer

app = typer.Typer(
    name="agentco",
    help="AgentCo — AI agent orchestration platform CLI",
    no_args_is_help=True,
)


@app.command()
def _run_migrations():
    """Apply all pending Alembic migrations (best-effort — skips if config not found)."""
    import os
    try:
        from alembic.config import Config
        from alembic import command
        ini_path = os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini")
        ini_path = os.path.abspath(ini_path)
        if not os.path.exists(ini_path):
            print(f"[deploy] alembic.ini not found at {ini_path}, skipping migrations")
            return
        alembic_cfg = Config(ini_path)
        command.upgrade(alembic_cfg, "head")
        print("[deploy] Alembic migrations applied")
    except Exception as e:
        print(f"[deploy] Migration warning (non-fatal): {e}")


@app.command()
def start(
    host: str = typer.Option("0.0.0.0", help="Bind host"),
    port: int = typer.Option(8000, help="Bind port"),
    workers: int = typer.Option(1, help="Number of worker processes"),
):
    """Start the AgentCo server (production mode)."""
    import uvicorn
    _run_migrations()
    uvicorn.run(
        "agentco.main:app",
        host=host,
        port=port,
        workers=workers,
    )


@app.command()
def dev(
    host: str = typer.Option("0.0.0.0", help="Bind host"),
    port: int = typer.Option(8000, help="Bind port"),
):
    """Start the AgentCo server in dev mode (hot-reload)."""
    import uvicorn
    _run_migrations()
    uvicorn.run(
        "agentco.main:app",
        host=host,
        port=port,
        reload=True,
    )


def main():
    """Entry point for the agentco CLI."""
    app()


if __name__ == "__main__":
    main()
