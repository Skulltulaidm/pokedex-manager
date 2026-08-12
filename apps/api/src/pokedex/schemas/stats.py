from decimal import Decimal

from pydantic import BaseModel


class TypeCount(BaseModel):
    type: str
    count: int


class GenerationCount(BaseModel):
    generation: int
    count: int


class OwnedSlot(BaseModel):
    """One collector number the user holds, and what that card is.

    The type travels with the number because the client draws coverage as a strip
    of type-coloured slots; without it every owned card renders the same.
    """

    number: str
    type: str | None


class SetCoverage(BaseModel):
    set_id: str
    set_name: str
    printed_total: int
    owned: int
    # One entry per printed card held, so the client can draw a slot per number
    # and light only the ones that are owned.
    owned_slots: list[OwnedSlot]


class CollectionValue(BaseModel):
    """What the collection is worth, and how much of it could be priced.

    The coverage travels with the total because most cards have no market price;
    a figure without it would read as complete when it is not.
    """

    total_eur: Decimal
    priced_cards: int
    unpriced_cards: int


class CollectionStats(BaseModel):
    total_groups: int
    total_cards: int
    value: CollectionValue
    types: list[TypeCount]
    generations: list[GenerationCount]
    sets: list[SetCoverage]
