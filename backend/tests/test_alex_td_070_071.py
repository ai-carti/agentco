"""
Tests for ALEX-TD-070 and ALEX-TD-071.

ALEX-TD-070: list_by_company/list_by_agent must use ORDER BY created_at ASC
             for deterministic ordering of agents and tasks.
ALEX-TD-071: _COST_PER_1K_TOKENS must include rates for claude-3-7, claude-4,
             gpt-4-turbo, gpt-4o-mini, o1, o3, gemini models.
"""
import pytest
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text as sa_text
from sqlalchemy.orm import sessionmaker

from agentco.orm.base import Base
from agentco.orm.agent import AgentORM
from agentco.orm.task import TaskORM
from agentco.orm.company import CompanyORM
from agentco.repositories.agent import AgentRepository
from agentco.repositories.task import TaskRepository


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session, engine
    session.close()


def _make_company(session, name="TestCo") -> str:
    import uuid
    company = CompanyORM(id=str(uuid.uuid4()), name=name)
    session.add(company)
    session.flush()
    return company.id


# ── ALEX-TD-070: AgentRepository.list_by_company ORDER BY created_at ASC ─────

def test_agent_list_by_company_deterministic_order(db_session):
    """
    list_by_company must return agents ordered by created_at ASC.
    Without ORDER BY the result order is non-deterministic.
    """
    import uuid
    session, engine = db_session
    company_id = _make_company(session)

    base_time = datetime(2024, 6, 1, 10, 0, 0)
    agent_ids = []
    for i in range(3):
        agent = AgentORM(
            id=str(uuid.uuid4()),
            company_id=company_id,
            name=f"Agent {i}",
            model="gpt-4o-mini",
        )
        session.add(agent)
        session.flush()
        agent_ids.append(agent.id)

    # Backfill distinct created_at so ordering is meaningful
    with engine.connect() as conn:
        for i, aid in enumerate(agent_ids):
            ts = base_time + timedelta(seconds=i)
            conn.execute(
                sa_text("UPDATE agents SET created_at = :ts WHERE id = :id"),
                {"ts": ts.isoformat(), "id": aid},
            )
        conn.commit()

    repo = AgentRepository(session)
    agents = repo.list_by_company(company_id)

    result_ids = [a.id for a in agents]
    assert result_ids == agent_ids, (
        f"ALEX-TD-070: list_by_company returned {result_ids}, "
        f"expected created_at ASC order {agent_ids}"
    )


# ── ALEX-TD-070: TaskRepository.list_by_company ORDER BY created_at ASC ──────

def test_task_list_by_company_deterministic_order(db_session):
    """
    list_by_company must return tasks ordered by created_at ASC.
    """
    import uuid
    session, engine = db_session
    company_id = _make_company(session)

    base_time = datetime(2024, 6, 1, 10, 0, 0)
    task_ids = []
    for i in range(3):
        task = TaskORM(
            id=str(uuid.uuid4()),
            company_id=company_id,
            title=f"Task {i}",
        )
        session.add(task)
        session.flush()
        task_ids.append(task.id)

    with engine.connect() as conn:
        for i, tid in enumerate(task_ids):
            ts = base_time + timedelta(seconds=i)
            conn.execute(
                sa_text("UPDATE tasks SET created_at = :ts WHERE id = :id"),
                {"ts": ts.isoformat(), "id": tid},
            )
        conn.commit()

    repo = TaskRepository(session)
    tasks = repo.list_by_company(company_id)

    result_ids = [t.id for t in tasks]
    assert result_ids == task_ids, (
        f"ALEX-TD-070: list_by_company (tasks) returned {result_ids}, "
        f"expected created_at ASC order {task_ids}"
    )


# ── ALEX-TD-070: TaskRepository.list_by_agent ORDER BY created_at ASC ────────

def test_task_list_by_agent_deterministic_order(db_session):
    """
    list_by_agent must return tasks ordered by created_at ASC.
    """
    import uuid
    session, engine = db_session
    company_id = _make_company(session)

    agent = AgentORM(
        id=str(uuid.uuid4()),
        company_id=company_id,
        name="Worker Agent",
        model="gpt-4o-mini",
    )
    session.add(agent)
    session.flush()

    base_time = datetime(2024, 6, 1, 10, 0, 0)
    task_ids = []
    for i in range(3):
        task = TaskORM(
            id=str(uuid.uuid4()),
            company_id=company_id,
            agent_id=agent.id,
            title=f"Task {i}",
        )
        session.add(task)
        session.flush()
        task_ids.append(task.id)

    with engine.connect() as conn:
        for i, tid in enumerate(task_ids):
            ts = base_time + timedelta(seconds=i)
            conn.execute(
                sa_text("UPDATE tasks SET created_at = :ts WHERE id = :id"),
                {"ts": ts.isoformat(), "id": tid},
            )
        conn.commit()

    repo = TaskRepository(session)
    tasks = repo.list_by_agent(agent.id)

    result_ids = [t.id for t in tasks]
    assert result_ids == task_ids, (
        f"ALEX-TD-070: list_by_agent returned {result_ids}, "
        f"expected created_at ASC order {task_ids}"
    )


# ── ALEX-TD-071: _COST_PER_1K_TOKENS covers new models ───────────────────────

def test_cost_per_1k_tokens_covers_new_models():
    """
    _COST_PER_1K_TOKENS must have explicit entries for:
    claude-3-7, claude-4, gpt-4-turbo, gpt-4o-mini, o1, o3, gemini.
    These should NOT fall back to 'default' (0.002).
    """
    from agentco.orchestration.agent_node import _COST_PER_1K_TOKENS, _estimate_cost

    default_rate = _COST_PER_1K_TOKENS["default"]

    new_models = [
        "claude-3-7-sonnet",
        "claude-4-opus",
        "gpt-4-turbo",
        "gpt-4o-mini",
        "o1",
        "o3",
        "gemini-1.5-pro",
    ]

    for model in new_models:
        # Check that the model is matched by a non-default prefix
        matched_prefix = None
        for prefix in _COST_PER_1K_TOKENS:
            if prefix != "default" and model.startswith(prefix):
                matched_prefix = prefix
                break
        assert matched_prefix is not None, (
            f"ALEX-TD-071: model '{model}' has no explicit rate in _COST_PER_1K_TOKENS "
            f"— falls back to default ({default_rate} USD/1K). Add it."
        )


def test_estimate_cost_new_models_not_default():
    """
    _estimate_cost for new models must return a rate different from default.
    """
    from agentco.orchestration.agent_node import _COST_PER_1K_TOKENS, _estimate_cost

    default_cost = _estimate_cost("unknown-model-xyz", 1000)

    models_expected_non_default = [
        "gpt-4-turbo",
        "gpt-4o-mini",
        "o1",
        "o3",
        "gemini-1.5-pro",
        "claude-3-7-sonnet",
        "claude-4-opus",
    ]

    for model in models_expected_non_default:
        cost = _estimate_cost(model, 1000)
        assert cost != default_cost, (
            f"ALEX-TD-071: _estimate_cost('{model}', 1000) = {cost}, "
            f"same as default ({default_cost}). Add explicit rate."
        )
