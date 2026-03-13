"""
M0-005: FastAPI serves Next.js static — GET / returns index.html.

TDD: red → (code exists) → green

Run: uv run pytest tests/test_static_serving.py -v
"""
from fastapi.testclient import TestClient
from agentco.main import app

client = TestClient(app)


def test_root_returns_200():
    """GET / должен вернуть 200."""
    response = client.get("/")
    assert response.status_code == 200


def test_root_returns_html():
    """GET / должен вернуть text/html."""
    response = client.get("/")
    assert "text/html" in response.headers["content-type"]


def test_root_contains_doctype():
    """GET / должен вернуть HTML-документ (<!DOCTYPE html>)."""
    response = client.get("/")
    assert "<!DOCTYPE html>" in response.text or "<!doctype html>" in response.text.lower()
