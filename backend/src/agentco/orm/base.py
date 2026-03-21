"""Declarative base shared by all ORM models.

## DB Table Naming Convention (ALEX-TD-066)

All table names follow **plural snake_case**:
    companies, agents, tasks, runs, run_events, credentials, mcp_servers, users

Rationale: plural is standard SQL convention (a table holds many rows).
Class names use ORM suffix: CompanyORM, AgentORM, etc.

Exception (historical): `agent_library` — singular, matches domain term
"Agent Library" as a collection concept. Left as-is to avoid migration churn.

Decision on `users`: already plural → consistent. No rename needed.
See: ALEX-TD-066.md for full analysis.
"""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
