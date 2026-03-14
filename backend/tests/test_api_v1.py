"""
M0-005: GET /api/v1/ returns base router stub.

TDD: red → (code) → green
"""
from fastapi.testclient import TestClient
from agentco.main import app

client = TestClient(app)


def test_api_v1_returns_200():
    """GET /api/v1/ должен вернуть 200."""
    response = client.get("/api/v1/")
    assert response.status_code == 200


def test_api_v1_returns_json():
    """GET /api/v1/ должен вернуть JSON с version или status."""
    response = client.get("/api/v1/")
    data = response.json()
    assert isinstance(data, dict)
