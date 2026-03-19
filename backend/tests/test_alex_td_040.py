"""
ALEX-TD-040: GET /api/library должен поддерживать пагинацию (limit/offset).

TDD: тест написан для проверки pagination behavior.
"""
import pytest


def _register_and_login(client, email="td040@example.com", password="pass123"):
    client.post("/auth/register", json={"email": email, "password": password})
    r = client.post("/auth/login", json={"email": email, "password": password})
    return r.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_company(client, token, name="Corp"):
    r = client.post("/api/companies/", json={"name": name}, headers=_auth(token))
    return r.json()["id"]


def _create_agent(client, token, company_id, name="Agent"):
    r = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "model": "gpt-4o-mini"},
        headers=_auth(token),
    )
    return r.json()["id"]


def _save_to_library(client, token, agent_id):
    return client.post("/api/library", json={"agent_id": agent_id}, headers=_auth(token))


class TestLibraryPagination:
    """ALEX-TD-040: GET /api/library pagination."""

    def test_list_library_accepts_limit_param(self, auth_client):
        """GET /api/library?limit=1 должен вернуть не более 1 записи."""
        client, _ = auth_client
        token = _register_and_login(client, email="td040_limit@example.com")
        company_id = _create_company(client, token, "Limit Corp")

        # Создаём 3 агента и добавляем в библиотеку
        for i in range(3):
            agent_id = _create_agent(client, token, company_id, f"Agent {i}")
            _save_to_library(client, token, agent_id)

        resp = client.get("/api/library?limit=1", headers=_auth(token))
        assert resp.status_code == 200
        assert len(resp.json()) <= 1

    def test_list_library_offset_pages(self, auth_client):
        """GET /api/library?offset=0&limit=1 и ?offset=1&limit=1 → разные элементы."""
        client, _ = auth_client
        token = _register_and_login(client, email="td040_offset@example.com")
        company_id = _create_company(client, token, "Offset Corp")

        # Создаём 3 агента
        for i in range(3):
            agent_id = _create_agent(client, token, company_id, f"OAgent {i}")
            _save_to_library(client, token, agent_id)

        resp0 = client.get("/api/library?limit=1&offset=0", headers=_auth(token))
        resp1 = client.get("/api/library?limit=1&offset=1", headers=_auth(token))
        assert resp0.status_code == 200
        assert resp1.status_code == 200

        ids0 = [item["id"] for item in resp0.json()]
        ids1 = [item["id"] for item in resp1.json()]
        # С 3 записями, страницы не должны совпадать
        assert ids0 != ids1

    def test_list_library_limit_max_500(self, auth_client):
        """GET /api/library?limit=501 должен вернуть 422."""
        client, _ = auth_client
        token = _register_and_login(client, email="td040_maxlimit@example.com")
        resp = client.get("/api/library?limit=501", headers=_auth(token))
        assert resp.status_code == 422

    def test_list_library_limit_min_1(self, auth_client):
        """GET /api/library?limit=0 должен вернуть 422."""
        client, _ = auth_client
        token = _register_and_login(client, email="td040_minlimit@example.com")
        resp = client.get("/api/library?limit=0", headers=_auth(token))
        assert resp.status_code == 422

    def test_list_library_negative_offset_422(self, auth_client):
        """GET /api/library?offset=-1 должен вернуть 422."""
        client, _ = auth_client
        token = _register_and_login(client, email="td040_negoffset@example.com")
        resp = client.get("/api/library?offset=-1", headers=_auth(token))
        assert resp.status_code == 422

    def test_list_library_default_params_200(self, auth_client):
        """GET /api/library без params должен работать как и раньше → 200."""
        client, _ = auth_client
        token = _register_and_login(client, email="td040_default@example.com")
        resp = client.get("/api/library", headers=_auth(token))
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
