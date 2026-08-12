from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from pokedex.db.models import CardCondition


class SpeciesView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    generation: int
    types: list[str]
    stats: dict[str, int]
    evolution_chain_id: int | None
    sprite_url: str | None


class CardSetView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    series: str | None
    printed_total: int
    release_date: date | None
    logo_url: str | None


class CardView(BaseModel):
    """A card with both layers: what is printed, and the species it depicts."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    category: str
    number: str
    rarity: str | None
    variants: dict[str, bool]
    hp: int | None
    image_small_url: str | None
    image_large_url: str | None
    card_set: CardSetView
    species: SpeciesView | None


class CollectionItemView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    quantity: int
    condition: CardCondition
    language: str
    is_graded: bool
    grade: float | None
    notes: str | None
    acquired_at: date | None
    created_at: datetime
    card: CardView
