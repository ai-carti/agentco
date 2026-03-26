"""
Tests for ALEX-TD-257, ALEX-TD-258, ALEX-TD-259, ALEX-TD-260.

ALEX-TD-257: orm/mcp_server.py — no UniqueConstraint(agent_id, name) → TOCTOU race.
ALEX-TD-258: orm/company.py — owner_id nullable=True should be nullable=False.
ALEX-TD-259: handlers/memory.py — le=500 inconsistent (should be le=100).
ALEX-TD-260: orm/task.py status + orm/agent.py model — Python-only default, no server_default.
"""
import pytest
import uuid as _uuid


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client) -> str:
    email = f"td257260_{_uuid.uuid4().hex[:8]}@test.com"
    client.post("/auth/register", json={"email": email, "password": "pass1234"})
    resp = client.post("/auth/login", json={"email": email, "password": "pass1234"})
    return resp.json()["access_token"]


# ── ALEX-TD-257: UniqueConstraint(agent_id, name) on mcp_servers ─────────────

class TestAlexTD257MCPServerUniqueConstraint:
    """DB-level UniqueConstraint prevents duplicate (agent_id, name) even under concurrent INSERTs."""

    def test_unique_constraint_exists_in_orm(self):
        """MCPServerORM must have UniqueConstraint(agent_id, name)."""
        from agentco.orm.mcp_server import MCPServerORM
        unique_on_agent_name = any(
            type(c).__name__ == "UniqueConstraint"
            and set(col.name for col in c.columns) == {"agent_id", "name"}
            for c in MCPServerORM.__table__.constraints
        )
        assert unique_on_agent_name, (
            "MCPServerORM missing UniqueConstraint(agent_id, name). "
            "Without it, concurrent POSTs can bypass the Python SELECT check and "
            "insert duplicate MCP server names for the same agent (TOCTOU race)."
        )

    def test_db_rejects_duplicate_mcp_server_name(self, auth_client):
        """SQLite enforces UniqueConstraint: second INSERT with same (agent_id, name) raises IntegrityError."""
        import uuid
        from sqlalchemy.exc import IntegrityError
        from sqlalchemy.orm import Session
        from sqlalchemy import text
        from agentco.orm.mcp_server import MCPServerORM

        _, engine = auth_client
        agent_id = str(uuid.uuid4())
        mcp1 = MCPServerORM(
            id=str(uuid.uuid4()),
            agent_id=agent_id,
            name="my-mcp",
            server_url="https://example.com/mcp",
            transport="sse",
        )
        mcp2 = MCPServerORM(
            id=str(uuid.uuid4()),
            agent_id=agent_id,
            name="my-mcp",  # same name → should violate constraint
            server_url="https://other.com/mcp",
            transport="sse",
        )
        with Session(engine) as session:
            # Disable FK for this test — we test UniqueConstraint, not FK
            session.execute(text("PRAGMA foreign_keys=OFF"))
            session.add(mcp1)
            session.commit()
            session.add(mcp2)
            with pytest.raises(IntegrityError):
                session.commit()

    def test_same_name_different_agents_allowed(self, auth_client):
        """Same MCP server name is fine for different agents."""
        import uuid
        from sqlalchemy.orm import Session
        from sqlalchemy import text
        from agentco.orm.mcp_server import MCPServerORM

        _, engine = auth_client
        agent_id_a = str(uuid.uuid4())
        agent_id_b = str(uuid.uuid4())

        mcp_a = MCPServerORM(
            id=str(uuid.uuid4()),
            agent_id=agent_id_a,
            name="shared-name",
            server_url="https://a.com/mcp",
            transport="sse",
        )
        mcp_b = MCPServerORM(
            id=str(uuid.uuid4()),
            agent_id=agent_id_b,
            name="shared-name",
            server_url="https://b.com/mcp",
            transport="sse",
        )
        with Session(engine) as session:
            session.execute(text("PRAGMA foreign_keys=OFF"))
            session.add_all([mcp_a, mcp_b])
            session.commit()  # should NOT raise


# ── ALEX-TD-258: company.owner_id should be nullable=False ───────────────────

class TestAlexTD258CompanyOwnerIdNotNull:
    """owner_id on companies must be NOT NULL — a company always has an owner."""

    def test_owner_id_is_not_nullable(self):
        """CompanyORM.owner_id must be nullable=False."""
        from agentco.orm.company import CompanyORM
        col = CompanyORM.__table__.c["owner_id"]
        assert not col.nullable, (
            "CompanyORM.owner_id is nullable=True. "
            "Every company must have an owner — nullable allows orphan companies that "
            "break all ownership checks in services (company.owner_id != owner_id always False for NULL). "
            "Fix: set nullable=False. (ALEX-TD-258)"
        )

    def test_db_rejects_company_without_owner(self, auth_client):
        """SQLite must reject INSERT into companies with NULL owner_id."""
        from sqlalchemy.exc import IntegrityError
        from sqlalchemy.orm import Session
        from agentco.orm.company import CompanyORM
        import uuid

        _, engine = auth_client
        company = CompanyORM(
            id=str(uuid.uuid4()),
            name="Ownerless Corp",
            owner_id=None,  # should be rejected
        )
        with Session(engine) as session:
            session.add(company)
            with pytest.raises((IntegrityError, Exception)):
                session.commit()


# ── ALEX-TD-259: handlers/memory.py le=500 should be le=100 ──────────────────

class TestAlexTD259MemoryEndpointLimitCap:
    """GET /memory endpoint limit cap must be le=100 (consistent with ALEX-TD-238 policy)."""

    def test_memory_limit_param_max_is_100(self, auth_client):
        """Request with limit=101 must return 422 (exceeds le=100)."""
        client, _ = auth_client
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        import uuid
        company_id = str(uuid.uuid4())
        agent_id = str(uuid.uuid4())

        resp = client.get(
            f"/api/companies/{company_id}/agents/{agent_id}/memory",
            params={"limit": 101},
            headers=headers,
        )
        assert resp.status_code == 422, (
            f"Expected 422 for limit=101 (le=100 policy), got {resp.status_code}. "
            "handlers/memory.py uses le=500 — inconsistent with ALEX-TD-238 policy. "
            "Fix: change le=500 → le=100. (ALEX-TD-259)"
        )

    def test_memory_limit_100_accepted(self, auth_client):
        """Request with limit=100 must not return 422."""
        client, _ = auth_client
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        import uuid
        company_id = str(uuid.uuid4())
        agent_id = str(uuid.uuid4())

        resp = client.get(
            f"/api/companies/{company_id}/agents/{agent_id}/memory",
            params={"limit": 100},
            headers=headers,
        )
        # 404 is fine (company doesn't exist), but not 422
        assert resp.status_code != 422, (
            f"limit=100 should be valid, got {resp.status_code}. (ALEX-TD-259)"
        )


# ── ALEX-TD-260: orm/task.py status + orm/agent.py model server_default ──────

class TestAlexTD260ServerDefaults:
    """ORM fields with Python defaults should also have server_default for direct SQL INSERTs."""

    def test_task_status_has_server_default(self):
        """TaskORM.status must have server_default='todo'."""
        from agentco.orm.task import TaskORM
        col = TaskORM.__table__.c["status"]
        assert col.server_default is not None, (
            "TaskORM.status has Python default='todo' but no server_default. "
            "Direct SQL INSERTs (Alembic seeds, raw psycopg2 inserts) get NULL status. "
            "Fix: add server_default='todo'. (ALEX-TD-260)"
        )

    def test_agent_model_has_server_default(self):
        """AgentORM.model must have server_default='gpt-4o-mini'."""
        from agentco.orm.agent import AgentORM
        col = AgentORM.__table__.c["model"]
        assert col.server_default is not None, (
            "AgentORM.model has Python default='gpt-4o-mini' but no server_default. "
            "Direct SQL INSERTs get NULL model, breaking orchestration that expects a string. "
            "Fix: add server_default='gpt-4o-mini'. (ALEX-TD-260)"
        )

    def test_task_status_default_value_is_todo(self, auth_client):
        """Task created via ORM (no explicit status) gets status='todo'."""
        import uuid
        from sqlalchemy.orm import Session
        from sqlalchemy import text
        from agentco.orm.task import TaskORM
        from agentco.orm.company import CompanyORM
        from agentco.orm.user import UserORM

        _, engine = auth_client
        user_id = str(uuid.uuid4())
        company_id = str(uuid.uuid4())
        with Session(engine) as session:
            # Disable FK for simplicity in unit test
            session.execute(text("PRAGMA foreign_keys=OFF"))
            user = UserORM(id=user_id, email=f"x{uuid.uuid4().hex[:6]}@x.com", hashed_password="h")
            company = CompanyORM(id=company_id, name="Test Co", owner_id=user_id)
            task = TaskORM(
                id=str(uuid.uuid4()),
                company_id=company_id,
                title="My Task",
                # no status specified — should default to 'todo'
            )
            session.add_all([user, company, task])
            session.commit()
            session.refresh(task)
            assert task.status == "todo", f"Expected status='todo', got {task.status!r}"
