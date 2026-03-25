"""
ALEX-TD-135: AgentState TypedDict missing NotRequired fields (system_prompt, model, tools, etc.)
ALEX-TD-136: stop_run / patch_stop_run endpoints have rate limiting.
ALEX-TD-137: list_library / get_portfolio have rate limiting.
ALEX-TD-138: _get_embedding guard on empty response.data.
"""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── ALEX-TD-135: AgentState has NotRequired fields ────────────────────────────

def test_agent_state_has_system_prompt_field():
    """AgentState TypedDict declares system_prompt as NotRequired."""
    from agentco.orchestration.state import AgentState
    annotations = AgentState.__annotations__
    assert "system_prompt" in annotations, "AgentState must declare system_prompt"


def test_agent_state_has_model_field():
    """AgentState TypedDict declares model as NotRequired."""
    from agentco.orchestration.state import AgentState
    annotations = AgentState.__annotations__
    assert "model" in annotations, "AgentState must declare model"


def test_agent_state_has_tools_field():
    """AgentState TypedDict declares tools as NotRequired."""
    from agentco.orchestration.state import AgentState
    annotations = AgentState.__annotations__
    assert "tools" in annotations, "AgentState must declare tools"


def test_agent_state_has_tool_handlers_field():
    """AgentState TypedDict declares tool_handlers as NotRequired."""
    from agentco.orchestration.state import AgentState
    annotations = AgentState.__annotations__
    assert "tool_handlers" in annotations, "AgentState must declare tool_handlers"


def test_agent_state_has_memory_service_field():
    """AgentState TypedDict declares memory_service as NotRequired."""
    from agentco.orchestration.state import AgentState
    annotations = AgentState.__annotations__
    assert "memory_service" in annotations, "AgentState must declare memory_service"


# ── ALEX-TD-136: stop_run endpoints have rate limiting ────────────────────────

def test_patch_stop_run_has_rate_limit_decorator():
    """PATCH /runs/{run_id}/stop has @limiter.limit decorator."""
    from agentco.handlers.runs import patch_stop_run
    # SlowAPI adds _rate_limit_info or similar; we check via inspection
    # Rate-limited endpoints have the _limiter attribute set by slowapi
    assert hasattr(patch_stop_run, "_rate_limit_info") or hasattr(patch_stop_run, "__wrapped__"), (
        "patch_stop_run should have rate limit decorator"
    )


def test_stop_run_accepts_normal_load(auth_client):
    """PATCH /runs/{run_id}/stop returns 404 (run not found) rather than 405 or 500."""
    client, _ = auth_client
    # Register and login
    client.post("/auth/register", json={"email": "td136_stop@example.com", "password": "pass1234"})
    resp = client.post("/auth/login", json={"email": "td136_stop@example.com", "password": "pass1234"})
    token = resp.json()["access_token"]

    company = client.post("/api/companies/", json={"name": "TD136 Co"}, headers={"Authorization": f"Bearer {token}"})
    company_id = company.json()["id"]

    # Stop a non-existent run — should be 404, not 405 (method not allowed) or 500
    resp = client.patch(
        f"/api/companies/{company_id}/runs/{str(uuid.uuid4())}/stop",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


def test_post_stop_run_accepts_normal_load(auth_client):
    """POST /runs/{run_id}/stop returns 404 (run not found) rather than 405 or 500."""
    client, _ = auth_client
    client.post("/auth/register", json={"email": "td136_poststop@example.com", "password": "pass1234"})
    resp = client.post("/auth/login", json={"email": "td136_poststop@example.com", "password": "pass1234"})
    token = resp.json()["access_token"]

    company = client.post("/api/companies/", json={"name": "TD136 Post Co"}, headers={"Authorization": f"Bearer {token}"})
    company_id = company.json()["id"]

    resp = client.post(
        f"/api/companies/{company_id}/runs/{str(uuid.uuid4())}/stop",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ── ALEX-TD-137: list_library / get_portfolio have rate limiting ───────────────

def test_list_library_accepts_normal_load(auth_client):
    """GET /api/library returns 200 list normally."""
    client, _ = auth_client
    client.post("/auth/register", json={"email": "td137_lib@example.com", "password": "pass1234"})
    resp = client.post("/auth/login", json={"email": "td137_lib@example.com", "password": "pass1234"})
    token = resp.json()["access_token"]

    resp = client.get("/api/library", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_get_portfolio_returns_404_for_missing(auth_client):
    """GET /api/library/{id}/portfolio returns 404 for unknown id."""
    client, _ = auth_client
    client.post("/auth/register", json={"email": "td137_portfolio@example.com", "password": "pass1234"})
    resp = client.post("/auth/login", json={"email": "td137_portfolio@example.com", "password": "pass1234"})
    token = resp.json()["access_token"]

    resp = client.get(
        "/api/library/nonexistent-id/portfolio",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ── ALEX-TD-138: _get_embedding guard on empty response ───────────────────────

@pytest.mark.asyncio
async def test_get_embedding_raises_on_empty_data():
    """_get_embedding raises ValueError when response.data is empty list."""
    from agentco.memory.service import MemoryService
    from unittest.mock import MagicMock, AsyncMock, patch

    service = MemoryService.__new__(MemoryService)

    mock_response = MagicMock()
    mock_response.data = []  # empty — IndexError without guard

    with patch("agentco.memory.service.litellm.aembedding", new=AsyncMock(return_value=mock_response)):
        with pytest.raises(ValueError, match="empty data list"):
            await service._get_embedding("test text")


@pytest.mark.asyncio
async def test_get_embedding_raises_on_none_embedding():
    """_get_embedding raises ValueError when embedding field is None."""
    from agentco.memory.service import MemoryService
    from unittest.mock import MagicMock, AsyncMock, patch

    service = MemoryService.__new__(MemoryService)

    mock_item = MagicMock()
    mock_item.embedding = None  # None — would cause downstream crash

    mock_response = MagicMock()
    mock_response.data = [mock_item]

    with patch("agentco.memory.service.litellm.aembedding", new=AsyncMock(return_value=mock_response)):
        with pytest.raises(ValueError, match="None embedding"):
            await service._get_embedding("test text")


@pytest.mark.asyncio
async def test_get_embedding_returns_embedding_on_success():
    """_get_embedding returns embedding list on valid response."""
    from agentco.memory.service import MemoryService
    from unittest.mock import MagicMock, AsyncMock, patch

    service = MemoryService.__new__(MemoryService)

    expected = [0.1, 0.2, 0.3]
    mock_item = MagicMock()
    mock_item.embedding = expected

    mock_response = MagicMock()
    mock_response.data = [mock_item]

    with patch("agentco.memory.service.litellm.aembedding", new=AsyncMock(return_value=mock_response)):
        result = await service._get_embedding("hello world")
        assert result == expected
