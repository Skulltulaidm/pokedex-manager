from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from pokedex.schemas.common import Page

NewsKind = Literal[
    "offer_waiting",
    "offer_answered",
    "trade_closed",
    "listing_taken",
    "message_unread",
    "wish_cheaper",
    "wish_dearer",
]


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
    # Whether the reader owes somebody something, which is what the badge counts
    # and what the screen can filter down to: a price that moved is news, an
    # offer nobody has answered is a task.
    actionable: bool = False
    # Whether it happened before the last time the reader opened the screen.
    # Every entry is derived from rows that keep existing, so without this the
    # same week of news would stay new forever.
    seen: bool = False


class NewsFeed(Page[NewsEntry]):
    waiting: int
