"""
M0-005: Smoke test — FastAPI /api/health endpoint.

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
