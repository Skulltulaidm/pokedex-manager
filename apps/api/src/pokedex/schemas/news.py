from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

NewsKind = Literal["offer_waiting", "offer_answered", "wish_cheaper", "wish_dearer"]


class NewsEntry(BaseModel):
    """Something that happened, told from the reader's side."""

    kind: NewsKind
    at: datetime
    title: str
    detail: str | None = None
    partner_id: str | None = None
    card_id: str | None = None
    card_name: str | None = None
    image_url: str | None = None
    amount: Decimal | None = None
    href: str | None = None
    # Whether the reader has something to do about it, which is what the badge
    # counts: a price that moved is news, an offer waiting is a task.
    actionable: bool = False


class NewsFeed(BaseModel):
    entries: list[NewsEntry]
    waiting: int
