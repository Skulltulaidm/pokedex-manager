from decimal import Decimal

from pydantic import BaseModel, Field

from pokedex.schemas.market import TradeLeg


class TradeAdviceRequest(BaseModel):
    # What the collector is after, in their own words. Empty means "anything
    # sensible", which is the common case.
    goal: str | None = Field(default=None, max_length=200)


class ProposedLeg(BaseModel):
    """A card in a proposal, carrying enough of itself to be drawn.

    The simulator shows cards, not names, and a proposal that arrived as ids
    would have to fetch each one back before it could render.
    """

    card_id: str
    card_name: str
    set_name: str = ""
    image_url: str | None = None
    category: str = "Pokemon"
    price_usd: Decimal | None = None
    owned: int = 1
    quantity: int = 1


class TradeAdvice(BaseModel):
    """A swap the assistant thinks is worth simulating.

    It proposes and explains; it never sends anything. The reader loads it into
    the simulator, which is where the numbers come from.
    """

    give: list[ProposedLeg]
    receive: list[ProposedLeg]
    rationale: str

    def legs(self) -> tuple[list[TradeLeg], list[TradeLeg]]:
        return (
            [TradeLeg(card_id=leg.card_id, quantity=leg.quantity) for leg in self.give],
            [TradeLeg(card_id=leg.card_id, quantity=leg.quantity) for leg in self.receive],
        )
