from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from pokedex.schemas.catalog import CardView

MarketSortKey = Literal["number", "name", "price", "owned"]
OwnedFilter = Literal["all", "owned", "missing"]


class MarketFilters(BaseModel):
    type: str | None = None
    generation: int | None = None
    set_id: str | None = None
    search: str | None = None
    owned: OwnedFilter = "all"
    sort: MarketSortKey = "number"
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)


class MarketCardView(BaseModel):
    """A catalog card plus how many copies the reader holds. Zero is a real
    answer here, not a missing one: the whole grid is owned against unowned."""

    card: CardView
    owned: int
    # The oldest holding, so a held card can link to a detail page. A card kept
    # in two conditions is two rows; the grid only needs somewhere to land.
    item_id: UUID | None = None


class MarketTypeCount(BaseModel):
    """How many catalog cards carry a type, and how many of those are held."""

    type: str
    total: int
    owned: int


class PriceChange(BaseModel):
    """Movement between the oldest reading inside a window and today."""

    since: date
    from_value: Decimal
    to_value: Decimal
    absolute: Decimal
    percent: float


class CardMarketContext(BaseModel):
    """Where one card sits in its set: what it is worth relative to the rest, and
    how much of that set the reader already holds."""

    price_rank: int | None
    priced_in_set: int
    cards_in_set: int
    owned_in_set: int
    set_value: Decimal
    change: PriceChange | None = None


class SetMarketView(BaseModel):
    """One set as a position: how much of it is held, and what finishing costs."""

    set_id: str
    set_name: str
    cards: int
    owned: int
    held_value: Decimal
    missing_value: Decimal
    total_value: Decimal


class MarketSummary(BaseModel):
    total_cards: int
    owned_cards: int
    catalog_value: Decimal
    owned_value: Decimal
    missing_value: Decimal
    types: list[MarketTypeCount]
    change: PriceChange | None = None
