from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from pokedex.schemas.catalog import CardView

MarketSortKey = Literal["number", "name", "price", "owned"]
OwnedFilter = Literal["all", "owned", "missing"]
PositionSortKey = Literal["value", "gain", "gain_percent", "cost", "quantity", "name"]
SortDirection = Literal["asc", "desc"]


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
    owned: int
    # The oldest holding, so a card already held can link to its own row rather
    # than to the form that would add it again.
    item_id: UUID | None
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


class PortfolioReturn(BaseModel):
    """What the holdings cost against what they are worth now.

    Measured only over the copies with a recorded cost, and it says how many
    those are: a return computed over half a collection would otherwise read as
    a return over all of it.
    """

    cost_basis: Decimal
    market_value: Decimal
    absolute: Decimal
    percent: float
    positions: int
    positions_without_cost: int


class PositionFilters(BaseModel):
    sort: PositionSortKey = "value"
    direction: SortDirection = "desc"
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class PositionView(BaseModel):
    """One held card as a position: what it cost, what it is worth now, and how
    much of the portfolio rests on it.

    Cost and gain are measured over the copies carrying a recorded cost, and
    `costed_quantity` says how many those are: a copy bought before costs were
    tracked would otherwise land on the value side of the subtraction alone and
    read as pure profit.
    """

    card: CardView
    quantity: int
    costed_quantity: int
    unit_cost_usd: Decimal | None
    cost_basis: Decimal | None
    market_value: Decimal | None
    gain_absolute: Decimal | None
    gain_percent: float | None
    portfolio_share: float


class ConcentrationBucket(BaseModel):
    """What the largest `cards` positions add up to."""

    cards: int
    value: Decimal
    share: float


class PortfolioConcentration(BaseModel):
    """How few cards carry the value.

    `cards_for_half` is the count of positions, largest first, that reach half
    the portfolio: one number for how exposed the whole thing is to a handful of
    cards. Unpriced holdings are counted but never valued.
    """

    total_value: Decimal
    priced_positions: int
    unpriced_positions: int
    buckets: list[ConcentrationBucket]
    cards_for_half: int | None


class TradeLeg(BaseModel):
    card_id: str
    quantity: int = Field(default=1, ge=1)


class TradeSimulationRequest(BaseModel):
    give: list[TradeLeg] = Field(default_factory=list, max_length=50)
    receive: list[TradeLeg] = Field(default_factory=list, max_length=50)


class TradeSimulation(BaseModel):
    """The portfolio either side of a swap that has not happened.

    Cards with no market price are named rather than valued at zero, because a
    swap resting on them is not the even trade the totals would claim.
    """

    before: PortfolioConcentration
    after: PortfolioConcentration
    give_value: Decimal
    receive_value: Decimal
    value_delta: Decimal
    unpriced_cards: list[str]


class MarketSummary(BaseModel):
    total_cards: int
    owned_cards: int
    catalog_value: Decimal
    owned_value: Decimal
    missing_value: Decimal
    types: list[MarketTypeCount]
    change: PriceChange | None = None
    performance: PortfolioReturn | None = None
