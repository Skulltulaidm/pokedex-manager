from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from pokedex.db.models import CardCondition, ListingStatus, OfferStatus
from pokedex.schemas.catalog import CardView


class TradeCard(BaseModel):
    """A card that could change hands, and how many copies are free to move."""

    card: CardView
    copies: int
    price_usd: Decimal | None


class TradeMatch(BaseModel):
    """A counterparty who wants something spare, and has something wanted.

    Only the cards on both sides of the overlap are named. What else the
    counterparty holds, and what their collection is worth, stay theirs: this
    answers whether a trade exists, not what someone owns.

    Values count one copy of each card. `balance` is what the trade is worth to
    the reader — positive means they come out ahead — and it is reported rather
    than balanced, because which cards even out a swap is the traders' call.
    """

    partner_id: str
    partner_name: str | None
    you_give: list[TradeCard]
    you_get: list[TradeCard]
    give_value: Decimal
    get_value: Decimal
    balance: Decimal
    unpriced: int


class ConditionCount(BaseModel):
    condition: CardCondition
    copies: int


class OfferCardInput(BaseModel):
    """A card put on the table, in a state.

    Leaving the condition out lets the service pick the worst copy its owner
    holds, which is the one a collector parts with.
    """

    card_id: str
    condition: CardCondition | None = None


class OfferCardView(BaseModel):
    """A card named in an offer.

    No copy count, unlike a match: a match reports what is available to trade,
    an offer names which cards are on the table.

    `price_usd` is the market price of a near mint copy, and `adjusted_usd`
    discounts it for the condition actually offered. They differ, and the gap is
    the reason condition belongs on an offer at all.
    """

    card: CardView
    condition: CardCondition
    price_usd: Decimal | None
    adjusted_usd: Decimal | None


class CreateOfferRequest(BaseModel):
    to_user_id: str
    offered: list[OfferCardInput] = Field(min_length=1)
    requested: list[OfferCardInput] = Field(min_length=1)
    message: str | None = Field(default=None, max_length=280)


class TradeOfferView(BaseModel):
    """An offer told from the reader's side.

    `you_give` and `you_get` swap meaning depending on who is looking, so the
    service resolves them per reader rather than storing them that way.
    """

    id: UUID
    status: OfferStatus
    direction: Literal["sent", "received"]
    partner_id: str
    partner_name: str | None
    you_give: list[OfferCardView]
    you_get: list[OfferCardView]
    give_value: Decimal
    get_value: Decimal
    balance: Decimal
    message: str | None
    replies_to_id: UUID | None
    created_at: datetime
    responded_at: datetime | None


class RespondOfferRequest(BaseModel):
    accept: bool


class SpareCard(BaseModel):
    """A card free to trade, seen by someone who might want it."""

    card: CardView
    copies: int
    price_usd: Decimal | None
    wanted: bool
    conditions: list[ConditionCount]


class CollectorView(BaseModel):
    """Another collector, described only by what could move between you.

    Their collection stays theirs: what is published is how much is spare and
    how much of it either of you is short of.
    """

    user_id: str
    name: str | None
    spares: int
    you_want: int
    they_want: int


class ListingCardView(BaseModel):
    """A card named on a listing.

    `condition` is null on the wanted side, and so is `adjusted_usd` with it:
    nobody has said yet which copy would arrive, so the market price is the only
    honest figure there.
    """

    card: CardView
    condition: CardCondition | None
    price_usd: Decimal | None
    adjusted_usd: Decimal | None


class CreateListingRequest(BaseModel):
    """Wanted cards are ids alone: a state can only be promised by whoever holds
    the card, and on this side nobody holds it yet."""

    give: list[OfferCardInput] = Field(min_length=1)
    want: list[str] = Field(min_length=1)
    note: str | None = Field(default=None, max_length=280)


class TradeListingView(BaseModel):
    """A listing as one reader sees it.

    Sides are named from the publisher, who is fixed, rather than from the
    reader, who is not. `balance` is what taking it would be worth — positive
    means the taker comes out ahead — and it is the same number for everyone.

    `available` is the publisher's half of the promise still standing, and
    `can_fulfil` the reader's: both have to be true for the listing to be
    takeable, and a listing whose publisher has since traded away what it names
    is shown rather than hidden, so the board does not appear to lose rows.
    """

    id: UUID
    owner_id: str
    owner_name: str | None
    is_mine: bool
    status: ListingStatus
    gives: list[ListingCardView]
    wants: list[ListingCardView]
    give_value: Decimal
    want_value: Decimal
    balance: Decimal
    available: bool
    can_fulfil: bool
    missing: int
    note: str | None
    offer_id: UUID | None
    created_at: datetime
    taken_at: datetime | None


class ProfileSet(BaseModel):
    set_id: str
    set_name: str
    owned: int
    printed_total: int


class CollectorProfile(BaseModel):
    """A collector as another collector may see them.

    Deliberately not a portfolio: what a collection is worth is a claim about a
    person, and it stays with them. What is published is what could move — how
    much is spare, what each of you is short of — plus the shape of what they
    collect, which is what tells you whether it is worth talking to them.
    """

    user_id: str
    name: str | None
    is_self: bool
    joined_at: datetime | None
    cards: int
    distinct_cards: int
    spares: int
    wants: int
    you_want: int
    they_want: int
    sets: list[ProfileSet]
