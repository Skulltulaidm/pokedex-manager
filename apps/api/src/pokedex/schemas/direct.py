from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DirectMessageView(BaseModel):
    """One message, told from the reader's side.

    `mine` is resolved per reader rather than stored: the same row is on the
    left for one of the two and on the right for the other.
    """

    id: UUID
    thread_id: UUID
    sender_id: str
    mine: bool
    body: str
    created_at: datetime
    read_at: datetime | None


class ThreadView(BaseModel):
    """A conversation as one of its two participants sees it.

    `id` is null for a conversation nobody has started. The partner is the
    address, not the thread, so a collector can be opened and written to before
    any row exists — which is what keeps an abandoned "Mensaje" click from
    leaving an empty thread in everyone's list.
    """

    id: UUID | None
    partner_id: str
    partner_name: str | None
    last_body: str | None
    last_at: datetime | None
    last_mine: bool
    unread: int


class SendMessageRequest(BaseModel):
    to_user_id: str
    body: str = Field(min_length=1, max_length=2000)
