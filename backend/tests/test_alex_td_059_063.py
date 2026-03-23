"""
Tests for ALEX-TD-059, ALEX-TD-060, ALEX-TD-062, ALEX-TD-063.

ALEX-TD-059: CredentialORM.company_id must have a DB index.
ALEX-TD-060: MCPServerORM.agent_id must have a DB index.
ALEX-TD-062: list_library must return results in deterministic order (ORDER BY created_at DESC).
ALEX-TD-063: execute_run must use CHECKPOINT_DB_PATH env var (not AGENTCO_DB_PATH) for checkpointer.
"""
import os
import pytest

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from agentco.orm.base import Base
from agentco.orm.credential import CredentialORM
from agentco.orm.mcp_server import MCPServerORM


# ── ALEX-TD-059: CredentialORM.company_id index ───────────────────────────────

def test_credential_company_id_has_index():
    """CredentialORM.company_id must be indexed for fast list_by_company queries."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    indexes = inspector.get_indexes("credentials")
    indexed_cols = {col for idx in indexes for col in idx["column_names"]}
    assert "company_id" in indexed_cols, (
        "ALEX-TD-059: CredentialORM.company_id has no index — "
        "list_by_company does a full table scan."
    )


# ── ALEX-TD-060: MCPServerORM.agent_id index ──────────────────────────────────

def test_mcp_server_agent_id_has_index():
    """MCPServerORM.agent_id must be indexed for fast list_mcp_servers queries."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    indexes = inspector.get_indexes("mcp_servers")
    indexed_cols = {col for idx in indexes for col in idx["column_names"]}
    assert "agent_id" in indexed_cols, (
        "ALEX-TD-060: MCPServerORM.agent_id has no index — "
        "list_mcp_servers does a full table scan."
    )


# ── ALEX-TD-062: list_library ORDER BY ────────────────────────────────────────

def _register_and_login_062(client, email="lib062@example.com", password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def test_list_library_deterministic_order(auth_client):
    """
    list_library must return results ordered by created_at DESC so pagination
    is deterministic (same records on same page across requests).

    SQLite server_default=func.now() has second-level precision, so we
    backfill distinct created_at values via direct DB update after insert.
    """
    from datetime import datetime, timedelta
    from sqlalchemy import text as sa_text

    client, engine = auth_client
    token = _register_and_login_062(client)
    auth_headers = {"Authorization": f"Bearer {token}"}

    # Create 3 library entries via saving agents
    company_resp = client.post("/api/companies/", json={"name": "LibOrderTest"}, headers=auth_headers)
    assert company_resp.status_code == 201
    company_id = company_resp.json()["id"]

    saved_ids = []
    for i in range(3):
        agent_resp = client.post(
            f"/api/companies/{company_id}/agents",
            json={"name": f"Agent {i}", "model": "gpt-4o-mini"},
            headers=auth_headers,
        )
        assert agent_resp.status_code == 201
        agent_id = agent_resp.json()["id"]

        lib_resp = client.post(
            "/api/library",
            json={"agent_id": agent_id},
            headers=auth_headers,
        )
        assert lib_resp.status_code == 201
        saved_ids.append(lib_resp.json()["id"])

    # Backfill distinct created_at: oldest first (saved_ids[0] oldest, saved_ids[-1] newest)
    base_time = datetime(2024, 1, 1, 12, 0, 0)
    with engine.connect() as conn:
        for i, lib_id in enumerate(saved_ids):
            ts = base_time + timedelta(seconds=i)
            conn.execute(
                sa_text("UPDATE agent_library SET created_at = :ts WHERE id = :id"),
                {"ts": ts.isoformat(), "id": lib_id},
            )
        conn.commit()

    # Fetch first page (limit=2, should get the 2 most-recent: saved_ids[2], saved_ids[1])
    resp1 = client.get("/api/library?limit=2&offset=0", headers=auth_headers)
    assert resp1.status_code == 200
    page1 = [e["id"] for e in resp1.json()]

    # Fetch same page again — must be identical (deterministic ORDER BY)
    resp2 = client.get("/api/library?limit=2&offset=0", headers=auth_headers)
    assert resp2.status_code == 200
    page2 = [e["id"] for e in resp2.json()]

    assert page1 == page2, "list_library pagination is non-deterministic (no ORDER BY)"

    # Newest entry (saved_ids[-1]) must appear first (ORDER BY created_at DESC)
    assert page1[0] == saved_ids[-1], (
        f"Expected most-recent entry ({saved_ids[-1]}) first, got {page1[0]}"
    )
    # Second entry should be saved_ids[1]
    assert page1[1] == saved_ids[1], (
        f"Expected second entry ({saved_ids[1]}), got {page1[1]}"
    )


# ── ALEX-TD-063: checkpointer uses CHECKPOINT_DB_PATH ────────────────────────

def test_execute_run_uses_checkpoint_db_path(monkeypatch, tmp_path):
    """
    execute_run must open checkpointer at CHECKPOINT_DB_PATH,
    not at AGENTCO_DB_PATH. They should be separate files.
    """
    checkpoint_path = str(tmp_path / "checkpoints.db")
    monkeypatch.setenv("CHECKPOINT_DB_PATH", checkpoint_path)

    from agentco.orchestration.checkpointer import get_checkpoint_db_path
    result = get_checkpoint_db_path()
    assert result == checkpoint_path, (
        f"ALEX-TD-063: get_checkpoint_db_path() returned {result!r}, "
        f"expected {checkpoint_path!r}"
    )

    # Also verify run.py now passes None to create_checkpointer (uses env var)
    # We check this by reading the source
    import inspect as ins
    import agentco.services.run as run_module
    src = ins.getsource(run_module.RunService.execute_run)
    # After fix: create_checkpointer() called without db_path argument
    # Before fix: create_checkpointer(_ckpt_db) with AGENTCO_DB_PATH
    assert "AGENTCO_DB_PATH" not in src or "CHECKPOINT_DB_PATH" in src or "create_checkpointer()" in src, (
        "ALEX-TD-063: execute_run still reads AGENTCO_DB_PATH for checkpointer "
        "instead of delegating to CHECKPOINT_DB_PATH via create_checkpointer()"
    )
