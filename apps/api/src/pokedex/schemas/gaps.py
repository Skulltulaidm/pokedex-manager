from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from pokedex.db.models.collection import WishlistSource
from pokedex.schemas.catalog import CardView


class SetGap(BaseModel):
    set_id: str
    set_name: str
    printed_total: int
    missing: list[CardView]


class AddWishlistRequest(BaseModel):
    card_id: str
    reason: str | None = Field(default=None, max_length=280)
    priority: int = Field(default=0, ge=0, le=3)


class WishlistItemView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    card: CardView
    priority: int
    reason: str | None
    added_by: WishlistSource
    created_at: datetime
    # Wanting a card you already hold is legitimate — a playset needs four — but
    # it is also how a want list goes stale, and a total that counts it is wrong.
    owned: int = 0
