from decimal import Decimal

from pydantic import BaseModel

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
