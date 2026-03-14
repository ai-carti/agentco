"""
M0-001: Test monorepo structure exists.
Run: python -m pytest tests_infra/test_monorepo_structure.py -v
"""
import os
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent


def p(*parts) -> Path:
    return REPO_ROOT.joinpath(*parts)


def test_backend_dir_exists():
    assert p("backend").is_dir(), "backend/ missing"


def test_backend_pyproject_toml():
    assert p("backend", "pyproject.toml").is_file(), "backend/pyproject.toml missing"


def test_backend_src_package():
    assert p("backend", "src", "agentco").is_dir(), "backend/src/agentco/ missing"
    assert p("backend", "src", "agentco", "__init__.py").is_file(), "backend/src/agentco/__init__.py missing"


def test_backend_tests_dir():
    assert p("backend", "tests").is_dir(), "backend/tests/ missing"


def test_frontend_dir_exists():
    assert p("frontend").is_dir(), "frontend/ missing"


def test_frontend_package_json():
    assert p("frontend", "package.json").is_file(), "frontend/package.json missing"


def test_frontend_src_dir():
    assert p("frontend", "src").is_dir(), "frontend/src/ missing"


def test_docker_dockerfile():
    assert p("docker", "Dockerfile").is_file(), "docker/Dockerfile missing"


def test_github_ci_workflow():
    assert p(".github", "workflows", "ci.yml").is_file(), ".github/workflows/ci.yml missing"


def test_readme():
    assert p("README.md").is_file(), "README.md missing"


def test_makefile():
    assert p("Makefile").is_file(), "Makefile missing"
    content = p("Makefile").read_text()
    assert "dev" in content, "Makefile missing 'dev' target"
    assert "test" in content, "Makefile missing 'test' target"
    assert "build" in content, "Makefile missing 'build' target"
    assert "install" in content, "Makefile missing 'install' target"
    assert "start" in content, "Makefile missing 'start' target"


def test_makefile_install_covers_frontend():
    """make install must install both backend (uv sync) and frontend (npm install)."""
    content = p("Makefile").read_text()
    assert "uv sync" in content, "Makefile install target must run 'uv sync' for backend"
    assert "npm install" in content, (
        "Makefile install target must run 'npm install' for frontend — "
        "currently only backend deps are installed"
    )


def test_gitignore_excludes_env():
    assert p(".gitignore").is_file(), ".gitignore missing"
    content = p(".gitignore").read_text()
    assert ".env" in content, ".gitignore must exclude .env files"
