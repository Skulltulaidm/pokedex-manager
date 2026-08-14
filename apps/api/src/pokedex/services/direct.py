from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import ColumnElement, Subquery, case, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import DirectMessage, DirectThread, auth_user
from pokedex.schemas.common import Page
from pokedex.schemas.direct import DirectMessageView, SendMessageRequest, ThreadView

PREVIEW_MAX = 160


class MessageError(RuntimeError):
    """A message the rules do not allow."""


def _member(user_id: str) -> ColumnElement[bool]:
    """Threads this reader is in.

    Built fresh per statement and applied to the statement that is executed: a
    membership filter that is assembled once and reused is a filter that can be
    dropped from the query it was meant to protect without anything failing.
    """
    return or_(DirectThread.first_user_id == user_id, DirectThread.second_user_id == user_id)


def _partner(user_id: str) -> ColumnElement[str]:
    return case(
        (DirectThread.first_user_id == user_id, DirectThread.second_user_id),
        else_=DirectThread.first_user_id,
    )


def _unread(user_id: str) -> ColumnElement[int]:
    return (
        select(func.count())
        .select_from(DirectMessage)
        .where(
            DirectMessage.thread_id == DirectThread.id,
            DirectMessage.sender_id != user_id,
            DirectMessage.read_at.is_(None),
        )
        .correlate(DirectThread)
        .scalar_subquery()
    )


def _latest() -> Subquery:
    """The last message of every thread, one row each."""
    return (
        select(
            DirectMessage.thread_id,
            DirectMessage.body,
            DirectMessage.created_at,
            DirectMessage.sender_id,
        )
        .distinct(DirectMessage.thread_id)
        .order_by(DirectMessage.thread_id, DirectMessage.created_at.desc(), DirectMessage.id)
        .subquery()
    )


def _preview(body: str) -> str:
    line = " ".join(body.split())
    if len(line) > PREVIEW_MAX:
        line = line[: PREVIEW_MAX - 1].rstrip() + "…"
    return line


async def _zone(db: AsyncSession) -> timezone:
    """The offset the timestamps in these rows were written with.

    The columns are naive and the API process need not run where the database
    does, so a message stamped by one and read as a time of day by the other
    lands hours out — and on the wrong day either side of midnight.
    """
    written_at = (await db.execute(select(func.current_timestamp()))).scalar_one()
    return timezone(written_at.utcoffset() or timedelta())


def _at(moment: datetime | None, zone: timezone) -> datetime | None:
    return None if moment is None else moment.replace(tzinfo=zone)


def _message_view(
    message: DirectMessage, user_id: str, zone: timezone
) -> DirectMessageView:
    return DirectMessageView(
        id=message.id,
        thread_id=message.thread_id,
        sender_id=message.sender_id,
        mine=message.sender_id == user_id,
        body=message.body,
        created_at=message.created_at.replace(tzinfo=zone),
        read_at=_at(message.read_at, zone),
    )


async def get_thread(db: AsyncSession, user_id: str, thread_id: UUID) -> DirectThread | None:
    """Scoped by participant: an id alone must never open someone else's thread."""
    result = await db.execute(
        select(DirectThread).where(DirectThread.id == thread_id, _member(user_id))
    )
    return result.scalar_one_or_none()


async def thread_page(
    db: AsyncSession,
    user_id: str,
    *,
    search: str | None = None,
    limit: int = 10,
    offset: int = 0,
) -> Page[ThreadView]:
    """Conversations, most recently spoken in first.

    The search reaches into what was said as well as who said it: a collector
    looking for the thread where a card was named remembers the card.
    """
    zone = await _zone(db)
    partner = _partner(user_id)
    latest = _latest()

    statement = (
        select(
            DirectThread.id,
            partner.label("partner_id"),
            auth_user.c.name,
            latest.c.body,
            latest.c.created_at,
            latest.c.sender_id,
            _unread(user_id).label("unread"),
        )
        .join(latest, latest.c.thread_id == DirectThread.id)
        .join(auth_user, auth_user.c.id == partner)
        .where(_member(user_id))
        .order_by(latest.c.created_at.desc())
    )

    if search and (needle := search.strip()):
        pattern = f"%{needle}%"
        said_it = (
            select(1)
            .select_from(DirectMessage)
            .where(DirectMessage.thread_id == DirectThread.id, DirectMessage.body.ilike(pattern))
            .exists()
        )
        statement = statement.where(or_(auth_user.c.name.ilike(pattern), said_it))

    total = await db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    rows = await db.execute(statement.limit(limit).offset(offset))

    return Page(
        items=[
            ThreadView(
                id=row.id,
                partner_id=row.partner_id,
                partner_name=row.name,
                last_body=_preview(row.body),
                last_at=row.created_at.replace(tzinfo=zone),
                last_mine=row.sender_id == user_id,
                unread=row.unread,
            )
            for row in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


async def thread_with(db: AsyncSession, user_id: str, partner_id: str) -> ThreadView | None:
    """The conversation with one collector, whether or not it has started."""
    if partner_id == user_id:
        return None

    partner = (
        await db.execute(
            select(auth_user.c.id, auth_user.c.name).where(auth_user.c.id == partner_id)
        )
    ).one_or_none()
    if partner is None:
        return None

    first, second = sorted((user_id, partner_id))
    found = await db.scalar(
        select(DirectThread.id).where(
            DirectThread.first_user_id == first, DirectThread.second_user_id == second
        )
    )
    if found is not None and (view := await _view(db, user_id, found)) is not None:
        return view

    return ThreadView(
        id=None,
        partner_id=partner_id,
        partner_name=partner.name,
        last_body=None,
        last_at=None,
        last_mine=False,
        unread=0,
    )


async def _view(db: AsyncSession, user_id: str, thread_id: UUID) -> ThreadView | None:
    zone = await _zone(db)
    partner = _partner(user_id)
    latest = _latest()
    row = (
        await db.execute(
            select(
                DirectThread.id,
                partner.label("partner_id"),
                auth_user.c.name,
                latest.c.body,
                latest.c.created_at,
                latest.c.sender_id,
                _unread(user_id).label("unread"),
            )
            .outerjoin(latest, latest.c.thread_id == DirectThread.id)
            .join(auth_user, auth_user.c.id == partner)
            .where(DirectThread.id == thread_id, _member(user_id))
        )
    ).one_or_none()
    if row is None:
        return None

    return ThreadView(
        id=row.id,
        partner_id=row.partner_id,
        partner_name=row.name,
        last_body=None if row.body is None else _preview(row.body),
        last_at=_at(row.created_at, zone),
        last_mine=row.sender_id == user_id,
        unread=row.unread,
    )


async def message_page(
    db: AsyncSession,
    user_id: str,
    thread_id: UUID,
    *,
    limit: int = 30,
    offset: int = 0,
) -> Page[DirectMessageView] | None:
    """One thread, cut from the newest end and handed back in reading order.

    Page one is the end of the conversation, because that is where a reader
    starts; paging back walks towards the beginning.
    """
    if await get_thread(db, user_id, thread_id) is None:
        return None

    zone = await _zone(db)
    total = (
        await db.scalar(
            select(func.count())
            .select_from(DirectMessage)
            .where(DirectMessage.thread_id == thread_id)
        )
        or 0
    )
    rows = await db.scalars(
        select(DirectMessage)
        .where(DirectMessage.thread_id == thread_id)
        .order_by(DirectMessage.created_at.desc(), DirectMessage.id.desc())
        .limit(limit)
        .offset(offset)
    )

    return Page(
        items=[_message_view(message, user_id, zone) for message in reversed(rows.all())],
        total=total,
        limit=limit,
        offset=offset,
    )


async def _open_thread(db: AsyncSession, user_id: str, partner_id: str) -> UUID:
    first, second = sorted((user_id, partner_id))
    # Inserted before it is read so two tabs writing at once end up in the same
    # thread rather than one of them failing on the unique constraint.
    await db.execute(
        pg_insert(DirectThread)
        .values(first_user_id=first, second_user_id=second)
        .on_conflict_do_nothing(constraint="uq_direct_thread_pair")
    )
    thread_id = await db.scalar(
        select(DirectThread.id).where(
            DirectThread.first_user_id == first, DirectThread.second_user_id == second
        )
    )
    assert thread_id is not None
    return thread_id


async def send(
    db: AsyncSession, user_id: str, request: SendMessageRequest
) -> DirectMessageView | None:
    """Say something to a collector, opening the conversation if it is the first.

    The author is the caller and nothing else: `to_user_id` addresses the
    message, and there is no field anywhere that names who wrote it.
    """
    if request.to_user_id == user_id:
        raise MessageError("Cannot start a conversation with yourself")

    recipient = await db.scalar(select(auth_user.c.id).where(auth_user.c.id == request.to_user_id))
    if recipient is None:
        return None

    body = request.body.strip()
    if not body:
        raise MessageError("A message cannot be empty")

    message = DirectMessage(
        thread_id=await _open_thread(db, user_id, request.to_user_id),
        sender_id=user_id,
        body=body,
    )
    db.add(message)
    await db.flush()
    await db.refresh(message)

    return _message_view(message, user_id, await _zone(db))


async def mark_read(db: AsyncSession, user_id: str, thread_id: UUID) -> ThreadView | None:
    """Everything the other one said is read. What the reader said is not theirs
    to mark: a sender who could clear their own messages would empty the badge
    on the screen of the person who has not looked yet."""
    if await get_thread(db, user_id, thread_id) is None:
        return None

    await db.execute(
        update(DirectMessage)
        .where(
            DirectMessage.thread_id == thread_id,
            DirectMessage.sender_id != user_id,
            DirectMessage.read_at.is_(None),
        )
        .values(read_at=func.now())
    )
    return await _view(db, user_id, thread_id)


async def unread_by_partner(db: AsyncSession, user_id: str) -> list[tuple[str, datetime, int]]:
    """Who is waiting on an answer, when they last wrote, and how much of it is
    unread — one row per conversation, for the news feed."""
    partner = _partner(user_id)
    rows = await db.execute(
        select(partner.label("partner_id"), func.max(DirectMessage.created_at), func.count())
        .select_from(DirectThread)
        .join(DirectMessage, DirectMessage.thread_id == DirectThread.id)
        .where(
            _member(user_id),
            DirectMessage.sender_id != user_id,
            DirectMessage.read_at.is_(None),
        )
        .group_by(DirectThread.id, partner)
    )
    return [(row[0], row[1], row[2]) for row in rows]
