from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ActivityKind = Literal["added", "scanned", "suggested"]


class ActivityEntry(BaseModel):
    """One thing that happened, flattened from the tables that record it."""

    kind: ActivityKind
    at: datetime
    card_id: str | None
    card_name: str | None
    image_url: str | None
    quantity: int | None
    value_usd: float | None
    detail: str | None
