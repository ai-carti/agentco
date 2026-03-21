"""ALEX-TD-064: ORM naming consistency smoke test.

Verifies that every symbol exported in `agentco.orm.__all__` is actually
importable and is a valid SQLAlchemy-mapped class (subclass of Base).

This prevents a repeat of the 2026-03-21 CI outage where:
- `UserORM` was listed in __all__ but the class was named `User`
- `McpServerORM` was listed in __all__ but the class was named `MCPServerORM`

Both caused ImportError at pytest collection time → 0/510 tests ran.
"""
import importlib
import inspect

import pytest
from sqlalchemy.orm import DeclarativeBase


def _get_orm_all():
    """Import agentco.orm and return its __all__ list."""
    orm_module = importlib.import_module("agentco.orm")
    return getattr(orm_module, "__all__", [])


def test_orm_all_symbols_are_importable():
    """Every name in agentco.orm.__all__ must be importable from agentco.orm."""
    orm_module = importlib.import_module("agentco.orm")
    all_names = _get_orm_all()

    assert all_names, "agentco.orm.__all__ must not be empty"

    missing = []
    for name in all_names:
        if not hasattr(orm_module, name):
            missing.append(name)

    assert not missing, (
        f"The following names are in agentco.orm.__all__ but not importable: {missing}\n"
        "Fix: either rename the class to match or update the import alias in __init__.py"
    )


def test_orm_all_symbols_are_mapped_classes():
    """Every ORM symbol (except Base) must be a SQLAlchemy mapped class."""
    orm_module = importlib.import_module("agentco.orm")
    all_names = _get_orm_all()

    non_mapped = []
    for name in all_names:
        if name == "Base":
            continue
        obj = getattr(orm_module, name, None)
        if obj is None:
            non_mapped.append(f"{name} (not found)")
            continue
        # Check if it's a class and has SQLAlchemy __tablename__ (mapped model)
        if not (inspect.isclass(obj) and hasattr(obj, "__tablename__")):
            non_mapped.append(f"{name} (no __tablename__, not a mapped ORM model)")

    assert not non_mapped, (
        f"The following symbols in agentco.orm.__all__ are not SQLAlchemy mapped models:\n"
        + "\n".join(f"  - {n}" for n in non_mapped)
    )


def test_orm_all_is_complete():
    """agentco.orm.__all__ must have at least the core models."""
    all_names = set(_get_orm_all())
    required = {"Base", "UserORM", "CompanyORM", "AgentORM", "TaskORM", "RunORM"}

    missing = required - all_names
    assert not missing, (
        f"Core ORM models missing from agentco.orm.__all__: {missing}"
    )
