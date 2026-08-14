from datetime import date, datetime
from decimal import Decimal
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


class EvolutionMemberView(BaseModel):
    """One species of an evolution family, as the card that stands for it.

    The sprite stays for the members the catalog prints no card of, which is the
    only case the line has nothing to show.
    """

    id: int
    name: str
    types: list[str]
    sprite_url: str | None
    card_id: str | None
    card_name: str | None
    card_image_url: str | None
    card_category: str | None
    owned: bool
    is_current: bool


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
    price_usd: Decimal | None = None
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
    unit_cost_usd: Decimal | None
    created_at: datetime
    card: CardView


class TriviaView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    text: str
    model: str
