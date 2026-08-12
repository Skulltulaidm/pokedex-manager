from typing import Literal

from pydantic import BaseModel, Field

from pokedex.db.models import CardCondition

SortKey = Literal["recent", "name", "number", "price"]


class CollectionFilters(BaseModel):
    type: str | None = None
    generation: int | None = None
    set_id: str | None = None
    condition: CardCondition | None = None
    search: str | None = None
    sort: SortKey = "recent"
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)


class AddCardRequest(BaseModel):
    card_id: str
    condition: CardCondition = CardCondition.NEAR_MINT
    quantity: int = Field(default=1, ge=1)
    language: str = Field(default="en", max_length=8)
    is_graded: bool = False
    grade: float | None = Field(default=None, ge=1, le=10)
    notes: str | None = None


class UpdateItemRequest(BaseModel):
    quantity: int | None = Field(default=None, ge=1)
    condition: CardCondition | None = None
    notes: str | None = None
