from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.api.route import CommittingRoute
from pokedex.schemas.common import Page
from pokedex.schemas.direct import DirectMessageView, SendMessageRequest, ThreadView
from pokedex.services import direct
from pokedex.services.direct import MessageError

router = APIRouter(prefix="/messages", tags=["messages"], route_class=CommittingRoute)


@router.get("", response_model=Page[ThreadView])
async def list_threads(
    user: CurrentUser,
    db: DbSession,
    search: str | None = None,
    limit: int = Query(default=12, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
) -> Any:
    """Conversations the reader is in, most recently spoken in first."""
    return await direct.thread_page(db, user.id, search=search, limit=limit, offset=offset)


# Declared before /{thread_id}: a thread is addressed by the collector on the
# other end long before it has an id of its own.
@router.get("/with/{partner_id}", response_model=ThreadView)
async def get_thread_with(partner_id: str, user: CurrentUser, db: DbSession) -> Any:
    """The conversation with one collector, started or not."""
    view = await direct.thread_with(db, user.id, partner_id)
    if view is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collector not found")

    return view


@router.get("/{thread_id}/messages", response_model=Page[DirectMessageView])
async def list_thread_messages(
    thread_id: UUID,
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> Any:
    """What was said, newest page first. Only the two participants may read it."""
    page = await direct.message_page(db, user.id, thread_id, limit=limit, offset=offset)
    if page is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")

    return page


@router.post("", response_model=DirectMessageView, status_code=status.HTTP_201_CREATED)
async def send_direct_message(
    request: SendMessageRequest, user: CurrentUser, db: DbSession
) -> Any:
    """Write to a collector. The first message is what opens the conversation."""
    try:
        message = await direct.send(db, user.id, request)
    except MessageError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    if message is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collector not found")

    return message


@router.post("/{thread_id}/read", response_model=ThreadView)
async def mark_thread_read(thread_id: UUID, user: CurrentUser, db: DbSession) -> Any:
    """Mark what the other one said as read."""
    view = await direct.mark_read(db, user.id, thread_id)
    if view is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")

    return view
