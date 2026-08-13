from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from pokedex.db.models import OfferStatus
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


class OfferCardView(BaseModel):
    """A card named in an offer.

    No copy count, unlike a match: a match reports what is available to trade,
    an offer names which cards are on the table.
    """

    card: CardView
    price_usd: Decimal | None


class CreateOfferRequest(BaseModel):
    to_user_id: str
    offered: list[str] = Field(min_length=1)
    requested: list[str] = Field(min_length=1)
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
    created_at: datetime
    responded_at: datetime | None


class RespondOfferRequest(BaseModel):
    accept: bool
