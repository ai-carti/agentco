import uuid
from datetime import datetime
from sqlalchemy import Text, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class CredentialORM(Base):
    __tablename__ = "credentials"

    # ALEX-TD-181: DB-level uniqueness for (company_id, provider) to prevent TOCTOU race.
    # ALEX-TD-175 added an app-level SELECT check, but two concurrent requests can both
    # pass it before either commits — resulting in duplicate credentials. The UniqueConstraint
    # guarantees atomicity at the SQLite layer (IntegrityError on the second INSERT).
    __table_args__ = (
        UniqueConstraint("company_id", "provider", name="uq_credentials_company_provider"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    # ALEX-TD-059: index on company_id for fast list_by_company queries
    company_id: Mapped[str] = mapped_column(Text, ForeignKey("companies.id"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    encrypted_api_key: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    company: Mapped["CompanyORM"] = relationship(back_populates="credentials")  # noqa: F821
