from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import (
    Card,
    CardPrice,
    CollectionItem,
    TradeListing,
    TradeOffer,
    WishlistItem,
    auth_user,
)
from pokedex.db.models.trade import ListingStatus, OfferStatus
from pokedex.schemas.news import NewsEntry, NewsFeed
from pokedex.services import direct, preferences

WINDOW = timedelta(days=7)

_FROM_A_LISTING = select(TradeListing.offer_id).where(TradeListing.offer_id.is_not(None))


async def _clock(db: AsyncSession) -> tuple[datetime, timezone]:
    """The clock every timestamp in here was written by, and its offset.

    Rows get their times from the database and the API process need not be in
    the same timezone, so a window measured with `datetime.now()` is off by the
    difference between the two. The offset is read alongside because the columns
    are naive: a browser cannot place a timestamp that does not say where it is
    from, and every one of these is rendered as a time of day.
    """
    row = (await db.execute(select(func.localtimestamp(), func.current_timestamp()))).one()
    naive: datetime = row[0]
    aware: datetime = row[1]
    return naive, timezone(aware.utcoffset() or timedelta())


async def _offers_waiting(db: AsyncSession, user_id: str) -> list[NewsEntry]:
    rows = await db.scalars(
        select(TradeOffer)
        .where(
            TradeOffer.to_user_id == user_id,
            TradeOffer.status == OfferStatus.PENDING,
        )
        .order_by(TradeOffer.created_at.desc())
    )
    return [
        NewsEntry(
            kind="offer_waiting",
            at=offer.created_at,
            title="Te llegó una oferta",
            detail="Está esperando tu respuesta.",
            partner_id=offer.from_user_id,
            href="/trades",
            actionable=True,
        )
        for offer in rows.all()
    ]


async def _offers_answered(db: AsyncSession, user_id: str, since: datetime) -> list[NewsEntry]:
    rows = await db.scalars(
        select(TradeOffer)
        .where(
            TradeOffer.from_user_id == user_id,
            TradeOffer.status.in_((OfferStatus.ACCEPTED, OfferStatus.DECLINED)),
            TradeOffer.responded_at.is_not(None),
            TradeOffer.responded_at >= since,
            # A listing that was taken is born as an accepted offer from its
            # publisher, and nobody answered anything: it is told as its own kind.
            TradeOffer.id.not_in(_FROM_A_LISTING),
        )
        .order_by(TradeOffer.responded_at.desc())
    )
    return [
        NewsEntry(
            kind="offer_answered",
            at=offer.responded_at or offer.created_at,
            title=(
                "Aceptaron tu oferta"
                if offer.status == OfferStatus.ACCEPTED
                else "Rechazaron tu oferta"
            ),
            detail=None,
            partner_id=offer.to_user_id,
            href="/trades",
            actionable=offer.status == OfferStatus.ACCEPTED,
        )
        for offer in rows.all()
    ]


async def _trades_closed(db: AsyncSession, user_id: str, since: datetime) -> list[NewsEntry]:
    """Offers the reader accepted, which is where a trade becomes a trade.

    Accepting moves no cards, so the entry stays a task until the two of them
    have met and filed what they got.
    """
    rows = await db.scalars(
        select(TradeOffer)
        .where(
            TradeOffer.to_user_id == user_id,
            TradeOffer.status == OfferStatus.ACCEPTED,
            TradeOffer.responded_at.is_not(None),
            TradeOffer.responded_at >= since,
            TradeOffer.id.not_in(_FROM_A_LISTING),
        )
        .order_by(TradeOffer.responded_at.desc())
    )
    return [
        NewsEntry(
            kind="trade_closed",
            at=offer.responded_at or offer.created_at,
            title="Cerraste un trueque",
            detail=None,
            partner_id=offer.from_user_id,
            href="/trades",
            actionable=True,
        )
        for offer in rows.all()
    ]


async def _listings_taken(db: AsyncSession, user_id: str, since: datetime) -> list[NewsEntry]:
    rows = await db.execute(
        select(TradeListing.taken_at, TradeOffer.to_user_id)
        .join(TradeOffer, TradeOffer.id == TradeListing.offer_id)
        .where(
            TradeListing.owner_id == user_id,
            TradeListing.status == ListingStatus.TAKEN,
            TradeListing.taken_at.is_not(None),
            TradeListing.taken_at >= since,
        )
        .order_by(TradeListing.taken_at.desc())
    )
    return [
        NewsEntry(
            kind="listing_taken",
            at=taken_at,
            title="Tomaron tu publicación",
            detail=None,
            partner_id=taker_id,
            href="/trades",
            actionable=True,
        )
        for taken_at, taker_id in rows.all()
    ]


async def _messages_unread(db: AsyncSession, user_id: str) -> list[NewsEntry]:
    """One entry per conversation with something unanswered in it.

    Not one per message: a collector who sent five lines wrote one thing to
    answer, and five rows in the feed would say otherwise.
    """
    return [
        NewsEntry(
            kind="message_unread",
            at=at,
            title="Te escribieron" if count == 1 else f"Te escribieron {count} mensajes",
            detail=None,
            partner_id=partner_id,
            href=f"/messages/{partner_id}",
            actionable=True,
        )
        for partner_id, at, count in await direct.unread_by_partner(db, user_id)
    ]


async def _wishlist_moves(
    db: AsyncSession, user_id: str, since: date, no_later_than: datetime
) -> list[NewsEntry]:
    """Cards the reader wants that changed price inside the window.

    Only cards they do not already hold: a want list keeps entries for copies
    already bought, and a price alert on those is noise.
    """
    wanted = (
        select(WishlistItem.card_id)
        .where(
            WishlistItem.user_id == user_id,
            ~WishlistItem.card_id.in_(
                select(CollectionItem.card_id).where(CollectionItem.user_id == user_id)
            ),
        )
        .scalar_subquery()
    )

    # Correlated per card, not a single max over the table: a card nobody
    # priced today would otherwise be compared against another card's day and
    # vanish from the feed.
    window = select(
        CardPrice.card_id, CardPrice.price_usd, CardPrice.recorded_on
    ).where(CardPrice.card_id.in_(wanted), CardPrice.recorded_on >= since)

    first = (
        window.distinct(CardPrice.card_id)
        .order_by(CardPrice.card_id, CardPrice.recorded_on)
        .subquery()
    )
    last = (
        window.distinct(CardPrice.card_id)
        .order_by(CardPrice.card_id, CardPrice.recorded_on.desc())
        .subquery()
    )

    rows = await db.execute(
        select(Card, last.c.price_usd, first.c.price_usd, last.c.recorded_on)
        .join(first, first.c.card_id == Card.id)
        .join(last, last.c.card_id == Card.id)
    )

    entries: list[NewsEntry] = []
    for card, now, was, recorded_on in rows.all():
        if was is None or now is None or was == now:
            continue
        move = Decimal(now) - Decimal(was)
        cheaper = move < 0
        entries.append(
            NewsEntry(
                kind="wish_cheaper" if cheaper else "wish_dearer",
                # A price belongs to a day, not to a moment. Midday keeps it on
                # that day for readers either side of the database's timezone,
                # and the clamp stops today's reading, which the database dates
                # hours ahead of a reader further west, from arriving as news
                # from tomorrow.
                at=min(no_later_than, datetime.combine(recorded_on, time(hour=12))),
                title=f"{card.name} {'bajó' if cheaper else 'subió'} de precio",
                detail=f"De ${was:,.2f} a ${now:,.2f}.",
                card_id=card.id,
                card_name=card.name,
                image_url=card.image_small_url,
                amount=move,
                href=None,
                actionable=False,
            )
        )
    return entries


async def _names(db: AsyncSession, ids: set[str]) -> dict[str, str | None]:
    if not ids:
        return {}
    rows = await db.execute(select(auth_user.c.id, auth_user.c.name).where(auth_user.c.id.in_(ids)))
    return {row.id: row.name for row in rows}


async def feed(
    db: AsyncSession,
    user_id: str,
    limit: int = 20,
    offset: int = 0,
    actionable_only: bool = False,
) -> NewsFeed:
    """What happened while the reader was not looking.

    Derived from the rows that already exist rather than from an event log:
    nothing here is worth writing twice, and an offer that was answered is
    already recorded as answered.

    The window is short enough that reading it all and paging in memory costs
    less than the queries it would take to page each kind in the database.
    """
    now, zone = await _clock(db)
    since = now - WINDOW
    seen_at = await preferences.marked_at(db, user_id, preferences.NOTIFICATIONS_SEEN_AT)

    entries = [
        *await _offers_waiting(db, user_id),
        *await _offers_answered(db, user_id, since),
        *await _trades_closed(db, user_id, since),
        *await _listings_taken(db, user_id, since),
        *await _messages_unread(db, user_id),
        *await _wishlist_moves(db, user_id, since.date(), now),
    ]
    entries.sort(key=lambda entry: entry.at, reverse=True)
    for entry in entries:
        # An unread message keeps its own read state, which is the stronger
        # claim: opening this screen is not reading what somebody wrote.
        entry.seen = (
            entry.kind != "message_unread" and seen_at is not None and entry.at <= seen_at
        )

    waiting = sum(1 for entry in entries if entry.actionable and not entry.seen)
    if actionable_only:
        entries = [entry for entry in entries if entry.actionable]

    total = len(entries)
    page = entries[offset : offset + limit]

    names = await _names(db, {entry.partner_id for entry in page if entry.partner_id})
    for entry in page:
        if entry.partner_id and not entry.detail:
            entry.detail = names.get(entry.partner_id) or "Otro coleccionista"
        entry.at = entry.at.replace(tzinfo=zone)

    return NewsFeed(items=page, total=total, limit=limit, offset=offset, waiting=waiting)


async def mark_seen(db: AsyncSession, user_id: str) -> datetime:
    """Everything up to now has been read."""
    at, _ = await _clock(db)
    await preferences.mark(db, user_id, preferences.NOTIFICATIONS_SEEN_AT, at)
    return at
