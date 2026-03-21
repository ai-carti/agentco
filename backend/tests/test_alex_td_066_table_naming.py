"""ALEX-TD-066: DB table naming convention lint test.

Convention (defined in orm/base.py):
- All table names: plural snake_case
- Exception: `agent_library` (historical, singular compound noun)

This test:
1. Verifies all table names are lowercase snake_case
2. Documents known exceptions explicitly
3. Warns if a new model is added that violates the convention
"""
import importlib
import inspect

import pytest

# Known exceptions to the plural rule with documented reasons
KNOWN_EXCEPTIONS = {
    "agent_library",  # Historical: domain term "Agent Library" as a collection concept
}

# All expected table names (ground truth)
EXPECTED_TABLE_NAMES = {
    "users",
    "companies",
    "agents",
    "tasks",
    "runs",
    "run_events",
    "credentials",
    "agent_library",
    "mcp_servers",
}


def _get_orm_models():
    """Return list of (class_name, tablename) for all ORM models."""
    orm_module = importlib.import_module("agentco.orm")
    all_names = getattr(orm_module, "__all__", [])

    models = []
    for name in all_names:
        if name == "Base":
            continue
        obj = getattr(orm_module, name, None)
        if obj is not None and inspect.isclass(obj) and hasattr(obj, "__tablename__"):
            models.append((name, obj.__tablename__))
    return models


def test_table_names_are_snake_case():
    """All table names must be lowercase snake_case (letters, digits, underscores)."""
    models = _get_orm_models()
    violations = []
    for class_name, tablename in models:
        if not tablename.replace("_", "").isalnum() or tablename != tablename.lower():
            violations.append(f"{class_name}.__tablename__ = '{tablename}'")

    assert not violations, (
        "Table names must be lowercase snake_case:\n"
        + "\n".join(f"  - {v}" for v in violations)
    )


def test_table_names_match_expected_set():
    """Table names must match the canonical set defined in this test.

    If you add a new model, add its table name to EXPECTED_TABLE_NAMES above.
    This ensures naming is reviewed on every new model addition.
    """
    models = _get_orm_models()
    actual = {tablename for _, tablename in models}

    added = actual - EXPECTED_TABLE_NAMES
    removed = EXPECTED_TABLE_NAMES - actual

    assert not added, (
        f"New table(s) found not in EXPECTED_TABLE_NAMES: {added}\n"
        "Add them to the set in test_alex_td_066_table_naming.py after reviewing naming convention."
    )
    assert not removed, (
        f"Table(s) removed that were in EXPECTED_TABLE_NAMES: {removed}\n"
        "Update the set in test_alex_td_066_table_naming.py."
    )


def test_table_names_convention_documented():
    """Verify convention is documented in orm/base.py."""
    import importlib.util
    import pathlib

    base_path = pathlib.Path(__file__).parent.parent / "src" / "agentco" / "orm" / "base.py"
    content = base_path.read_text()

    assert "ALEX-TD-066" in content, (
        "Naming convention must be documented in orm/base.py. "
        "See ALEX-TD-066.md for the decision record."
    )
    assert "plural" in content.lower(), (
        "orm/base.py must document the plural snake_case convention."
    )
