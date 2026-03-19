"""
Base repository — generic CRUD, maps ORM ↔ domain model.

Rules:
- Receives Session from outside. Never creates it internally.
- All methods return domain models (from models/), NOT ORM objects.
- Raise NotFoundError when a required entity is missing.
- NO business logic. NO session.commit().
"""
from typing import Generic, TypeVar, Type
from sqlalchemy.orm import Session
from sqlalchemy import select

ORMType = TypeVar("ORMType")
DomainType = TypeVar("DomainType")


class NotFoundError(Exception):
    pass


class ConflictError(Exception):
    pass


class BaseRepository(Generic[ORMType, DomainType]):
    orm_model: Type[ORMType]

    def __init__(self, session: Session) -> None:
        self._session = session

    def _to_domain(self, orm_obj: ORMType) -> DomainType:
        """Override in subclass to map ORM → domain model."""
        raise NotImplementedError

    def _to_orm(self, domain_obj: DomainType) -> ORMType:
        """Override in subclass to map domain → ORM model."""
        raise NotImplementedError

    def get(self, id: str) -> DomainType:
        obj = self._session.get(self.orm_model, id)
        if obj is None:
            raise NotFoundError(f"{self.orm_model.__name__} {id!r} not found")
        return self._to_domain(obj)

    def get_or_none(self, id: str) -> DomainType | None:
        obj = self._session.get(self.orm_model, id)
        return self._to_domain(obj) if obj else None

    def list(self, limit: int | None = None, offset: int | None = None, order_by=None, **filters) -> list[DomainType]:
        """ALEX-TD-046: добавлен order_by параметр для детерминированной сортировки."""
        stmt = select(self.orm_model)
        for attr, value in filters.items():
            stmt = stmt.where(getattr(self.orm_model, attr) == value)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        if offset is not None:
            stmt = stmt.offset(offset)
        if limit is not None:
            stmt = stmt.limit(limit)
        return [self._to_domain(row) for row in self._session.scalars(stmt).all()]

    def add(self, domain_obj: DomainType) -> DomainType:
        orm_obj = self._to_orm(domain_obj)
        self._session.add(orm_obj)
        self._session.flush()
        return self._to_domain(orm_obj)

    def delete(self, id: str) -> None:
        orm_obj = self._session.get(self.orm_model, id)
        if orm_obj is None:
            raise NotFoundError(f"{self.orm_model.__name__} {id!r} not found")
        self._session.delete(orm_obj)
        self._session.flush()
