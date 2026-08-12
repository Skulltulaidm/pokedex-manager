import enum
from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Enum,
    ForeignKey,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pokedex.db.base import Base
from pokedex.db.models.catalog import Card

SCHEMA = "pokedex"
AUTH_USER_ID = "auth.user.id"


class CardCondition(enum.StrEnum):
    MINT = "mint"
    NEAR_MINT = "near_mint"
    LIGHTLY_PLAYED = "lightly_played"
    MODERATELY_PLAYED = "moderately_played"
    HEAVILY_PLAYED = "heavily_played"
    DAMAGED = "damaged"


class ScanStatus(enum.StrEnum):
    PENDING = "pending"
    EXTRACTED = "extracted"
    AMBIGUOUS = "ambiguous"
    RESOLVED = "resolved"
    FAILED = "failed"


class WishlistSource(enum.StrEnum):
    USER = "user"
    AGENT = "agent"


def pg_enum(enum_cls: type[enum.StrEnum], name: str) -> Enum:
    """Postgres enum stored as the member values, not the uppercase member names."""
    return Enum(
        enum_cls,
        name=name,
        schema=SCHEMA,
        values_callable=lambda members: [m.value for m in members],
    )


class CollectionItem(Base):
    """One row per homogeneous group of copies, not per physical card."""

    __tablename__ = "collection_item"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "card_id",
            "condition",
            "language",
            "is_graded",
            "grade",
            name="uq_collection_item_group",
            # `grade` is NULL for every ungraded card, and Postgres treats NULLs
            # as distinct by default — which would let the same group be inserted
            # repeatedly and keep ON CONFLICT from ever firing.
            postgresql_nulls_not_distinct=True,
        ),
        CheckConstraint("quantity > 0", name="ck_collection_item_quantity_positive"),
        CheckConstraint(
            "(is_graded AND grade IS NOT NULL) OR (NOT is_graded AND grade IS NULL)",
            name="ck_collection_item_grade_only_when_graded",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    user_id: Mapped[str] = mapped_column(ForeignKey(AUTH_USER_ID, ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(ForeignKey(f"{SCHEMA}.card.id"), index=True)

    condition: Mapped[CardCondition] = mapped_column(
        pg_enum(CardCondition, "card_condition"), default=CardCondition.NEAR_MINT
    )
    language: Mapped[str] = mapped_column(String(8), default="en")
    is_graded: Mapped[bool] = mapped_column(default=False)
    grade: Mapped[float | None] = mapped_column(Numeric(3, 1))

    quantity: Mapped[int] = mapped_column(default=1)
    notes: Mapped[str | None] = mapped_column(Text)
    acquired_at: Mapped[date | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    card: Mapped[Card] = relationship(lazy="raise")


class WishlistItem(Base):
    __tablename__ = "wishlist_item"
    __table_args__ = (UniqueConstraint("user_id", "card_id", name="uq_wishlist_item_user_card"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    user_id: Mapped[str] = mapped_column(ForeignKey(AUTH_USER_ID, ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(ForeignKey(f"{SCHEMA}.card.id"), index=True)

    priority: Mapped[int] = mapped_column(SmallInteger, default=0)
    reason: Mapped[str | None] = mapped_column(Text)
    # Distinguishes user-added entries from agent suggestions, so their
    # conversion rate is measurable.
    added_by: Mapped[WishlistSource] = mapped_column(
        pg_enum(WishlistSource, "wishlist_source"), default=WishlistSource.USER
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    card: Mapped[Card] = relationship(lazy="raise")


class Scan(Base):
    """Audit trail for a scan: what the model read, what matched, what was kept."""

    __tablename__ = "scan"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    user_id: Mapped[str] = mapped_column(ForeignKey(AUTH_USER_ID, ondelete="CASCADE"), index=True)

    image_key: Mapped[str] = mapped_column(Text)
    extracted: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    candidate_ids: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    resolved_card_id: Mapped[str | None] = mapped_column(ForeignKey(f"{SCHEMA}.card.id"))
    status: Mapped[ScanStatus] = mapped_column(
        pg_enum(ScanStatus, "scan_status"), default=ScanStatus.PENDING, index=True
    )
    model: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)
