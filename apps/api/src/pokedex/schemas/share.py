from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from pokedex.db.models.collection import CardCondition
from pokedex.schemas.catalog import CardView
from pokedex.schemas.stats import SetCoverage, TypeCount


class ShareLinkView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    token: str
    created_at: datetime


class PublicItemView(BaseModel):
    """A narrower view than the owner's own.

    Notes are free text the user wrote for themselves, and acquisition dates
    describe their habits; neither belongs on a page anyone with the link can
    open. Reusing the private view here would have published both.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    quantity: int
    condition: CardCondition
    card: CardView


class PublicCollection(BaseModel):
    total_cards: int
    total_groups: int
    types: list[TypeCount]
    sets: list[SetCoverage]
    items: list[PublicItemView]
