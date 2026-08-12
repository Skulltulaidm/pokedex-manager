from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import ForeignKey, Index, Numeric, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pokedex.db.base import Base

SCHEMA = "pokedex"


class Species(Base):
    """Species layer, mirrored from PokeAPI. Shared by every user."""

    __tablename__ = "species"
    __table_args__ = (Index("ix_species_types", "types", postgresql_using="gin"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    generation: Mapped[int] = mapped_column(SmallInteger, index=True)
    types: Mapped[list[str]] = mapped_column(ARRAY(Text))
    stats: Mapped[dict[str, Any]] = mapped_column(JSONB)
    evolution_chain_id: Mapped[int | None] = mapped_column(index=True)
    sprite_url: Mapped[str | None] = mapped_column(Text)
    fetched_at: Mapped[datetime] = mapped_column(server_default=func.now())


class CardSet(Base):
    """Set layer, mirrored from the TCG API."""

    __tablename__ = "card_set"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    series: Mapped[str | None] = mapped_column(Text)
    # The denominator printed on a card ("4/102"), and the strongest scan signal.
    # Distinct from `total`, which also counts secret rares beyond the official run.
    printed_total: Mapped[int] = mapped_column(SmallInteger, index=True)
    total: Mapped[int | None] = mapped_column(SmallInteger)
    release_date: Mapped[date | None]
    symbol_url: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(Text)
    fetched_at: Mapped[datetime] = mapped_column(server_default=func.now())

    cards: Mapped[list["Card"]] = relationship(back_populates="card_set")


class Card(Base):
    """Card layer, mirrored from the TCG API."""

    __tablename__ = "card"
    __table_args__ = (
        Index(
            "ix_card_name_normalized_trgm",
            "name_normalized",
            postgresql_using="gin",
            postgresql_ops={"name_normalized": "gin_trgm_ops"},
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    set_id: Mapped[str] = mapped_column(ForeignKey(f"{SCHEMA}.card_set.id"), index=True)
    # Authoritative, from the source's dexId. Null only for Trainer and Energy
    # cards, which depict no species at all.
    species_id: Mapped[int | None] = mapped_column(ForeignKey(f"{SCHEMA}.species.id"), index=True)

    category: Mapped[str] = mapped_column(String(16), index=True)
    number: Mapped[str] = mapped_column(String(16))
    number_prefix: Mapped[str] = mapped_column(String(16), index=True)
    name: Mapped[str] = mapped_column(Text)
    name_normalized: Mapped[str] = mapped_column(Text)
    rarity: Mapped[str | None] = mapped_column(String(64), index=True)
    # Which printings exist for this card (holo, reverse, firstEdition...), so
    # the confirmation step can offer only the variants that are real.
    variants: Mapped[dict[str, bool]] = mapped_column(JSONB, default=dict)
    hp: Mapped[int | None] = mapped_column(SmallInteger)
    image_small_url: Mapped[str | None] = mapped_column(Text)
    image_large_url: Mapped[str | None] = mapped_column(Text)
    # Cardmarket trend, in EUR. Null for most cards, which is why anything that
    # totals it has to report the coverage alongside.
    price_eur: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    price_updated_at: Mapped[datetime | None]
    fetched_at: Mapped[datetime] = mapped_column(server_default=func.now())

    card_set: Mapped[CardSet] = relationship(back_populates="cards")
    species: Mapped[Species | None] = relationship()
