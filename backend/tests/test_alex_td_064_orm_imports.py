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


def test_orm_all_covers_all_defined_orm_classes():
    """Every ORM class defined in orm/*.py must be exported via agentco.orm.__all__.

    BUG-057: the previous test only checked a hardcoded set of core models.
    This test dynamically scans all *.py files in the orm package, finds every
    ``class *ORM(Base)`` definition via AST, and verifies the class object is
    reachable through agentco.orm.__all__ (handles aliases like MCPServerORM →
    McpServerORM correctly by comparing by object identity, not name).
    """
    import ast
    import importlib
    import importlib.util
    import pathlib

    # Locate the orm package directory via the module spec
    orm_spec = importlib.util.find_spec("agentco.orm")
    assert orm_spec is not None, "agentco.orm package not found"
    orm_dir = pathlib.Path(orm_spec.origin).parent  # …/src/agentco/orm/

    orm_module = importlib.import_module("agentco.orm")
    all_names = _get_orm_all()

    # Build a set of class objects that are exported via __all__
    exported_objects = set()
    for name in all_names:
        obj = getattr(orm_module, name, None)
        if obj is not None:
            exported_objects.add(obj)

    not_exported: list[str] = []

    for py_file in sorted(orm_dir.glob("*.py")):
        if py_file.name in ("__init__.py", "base.py"):
            continue  # skip package init and Base definition

        source = py_file.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(py_file))

        for node in ast.walk(tree):
            if not isinstance(node, ast.ClassDef):
                continue
            if not node.name.endswith("ORM"):
                continue
            # Only classes that inherit from Base (direct Base reference)
            base_names = []
            for base in node.bases:
                if isinstance(base, ast.Name):
                    base_names.append(base.id)
                elif isinstance(base, ast.Attribute):
                    base_names.append(base.attr)
            if "Base" not in base_names:
                continue

            # Import the defining module and get the class object
            module_name = f"agentco.orm.{py_file.stem}"
            defining_module = importlib.import_module(module_name)
            cls_obj = getattr(defining_module, node.name, None)

            if cls_obj is None or cls_obj not in exported_objects:
                not_exported.append(
                    f"{node.name} (defined in orm/{py_file.name})"
                )

    assert not not_exported, (
        "The following ORM classes are defined in orm/*.py but NOT exported via "
        "agentco.orm.__all__:\n"
        + "\n".join(f"  - {entry}" for entry in not_exported)
        + "\n\nFix: add the class (or an alias) to orm/__init__.py and __all__."
    )
