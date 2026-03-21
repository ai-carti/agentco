# ALEX-TD-066: DB Table Naming Convention

**Date:** 2026-03-21  
**Author:** Alex  
**Status:** Documented + test added

---

## Problem

`orm/user.py` has `__tablename__ = "users"` — appeared to be the only plural table.
Audit revealed actual state:

| Table | Model | Convention |
|---|---|---|
| `companies` | CompanyORM | plural ✅ |
| `agents` | AgentORM | plural ✅ |
| `tasks` | TaskORM | plural ✅ |
| `runs` | RunORM | plural ✅ |
| `run_events` | RunEventORM | plural ✅ |
| `credentials` | CredentialORM | plural ✅ |
| `mcp_servers` | MCPServerORM | plural ✅ |
| `users` | UserORM | plural ✅ |
| `agent_library` | AgentLibraryORM | **singular** ⚠️ |

**Conclusion:** `users` is NOT the odd one out — it IS consistent with the rest.
The convention is already **plural snake_case**. `agent_library` is the only exception.

---

## Decision: Do NOT rename `users`

`users` is already plural, consistent with all other tables. No rename needed.

If there had been a rename, it would have required:
- New Alembic migration `op.rename_table("users", "user")`
- Risk of breaking Railway deploy if migrations don't run before app start
- Risk of FK breakage in `companies.owner_id → users.id` (migration 0003)

Since no rename is needed, no migration risk exists.

---

## Decision: `agent_library` stays singular

- Created in migration 0008 as `agent_library`
- Alembic + FK references baked in
- Renaming to `agent_libraries` requires new migration + FK update
- Low risk but zero benefit — cosmetic change

Accepted as **historical exception**.

---

## Convention (now documented in `orm/base.py`)

**Plural snake_case** for all table names.  
Exception: `agent_library` (historical).

---

## Acceptance Criteria Check

- [x] Analyzed current table names
- [x] Convention documented in `orm/base.py` (docstring with ALEX-TD-066 tag)
- [x] `users` confirmed consistent — no rename needed
- [x] `agent_library` exception documented
- [x] Test added: `tests/test_alex_td_066_table_naming.py` (3 tests, 0.03s)
- [x] All 3 tests pass
