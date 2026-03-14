"""
M0-005: Smoke test — FastAPI health endpoints.

Run: uv run pytest tests/test_health.py -v
"""
from fastapi.testclient import TestClient
from agentco.main import app

client = TestClient(app)


def test_health_returns_200():
    response = client.get("/api/health")
    assert response.status_code == 200


def test_health_returns_correct_payload():
    response = client.get("/api/health")
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"


# AC2: GET /health → {"status": "ok"} 200
def test_health_root_returns_200():
    """GET /health должен вернуть 200."""
    response = client.get("/health")
    assert response.status_code == 200


def test_health_root_returns_status_ok():
    """GET /health должен вернуть {"status": "ok"}."""
    response = client.get("/health")
    data = response.json()
    assert data["status"] == "ok"
