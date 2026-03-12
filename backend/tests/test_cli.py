"""
M0-002: Tests for CLI entry point.

Run: uv run pytest tests/test_cli.py -v
"""
import subprocess
import sys
from pathlib import Path


def test_cli_module_importable():
    """agentco.cli module exists and is importable."""
    from agentco.cli import app
    assert app is not None


def test_cli_has_start_command():
    """CLI has 'start' command registered."""
    from typer.testing import CliRunner
    from agentco.cli import app

    runner = CliRunner()
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "start" in result.output


def test_cli_has_dev_command():
    """CLI has 'dev' command registered."""
    from typer.testing import CliRunner
    from agentco.cli import app

    runner = CliRunner()
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "dev" in result.output


def test_entry_point_registered():
    """agentco entry point is registered in pyproject.toml."""
    pyproject = Path(__file__).parent.parent / "pyproject.toml"
    content = pyproject.read_text()
    assert "[project.scripts]" in content
    assert "agentco" in content
    assert "agentco.cli:main" in content


def test_cli_start_help():
    """agentco start --help works without error."""
    from typer.testing import CliRunner
    from agentco.cli import app

    runner = CliRunner()
    result = runner.invoke(app, ["start", "--help"])
    assert result.exit_code == 0


def test_cli_dev_help():
    """agentco dev --help works without error."""
    from typer.testing import CliRunner
    from agentco.cli import app

    runner = CliRunner()
    result = runner.invoke(app, ["dev", "--help"])
    assert result.exit_code == 0
