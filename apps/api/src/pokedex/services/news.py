from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import (
    Card,
    CardPrice,
    CollectionItem,
    TradeOffer,
    WishlistItem,
    auth_user,
)
from pokedex.db.models.trade import OfferStatus
from pokedex.schemas.news import NewsEntry, NewsFeed

WINDOW = timedelta(days=7)


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


async def _wishlist_moves(db: AsyncSession, user_id: str, since: date) -> list[NewsEntry]:
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
                at=datetime.combine(recorded_on, datetime.min.time()),
                title=f"{card.name} {'bajó' if cheaper else 'subió'} de precio",
                detail=f"De ${was:,.2f} a ${now:,.2f}.",
                card_id=card.id,
                card_name=card.name,
                image_url=card.image_small_url,
                amount=move,
                href=None,
                actionable=cheaper,
            )
        )
    return entries


async def _names(db: AsyncSession, ids: set[str]) -> dict[str, str | None]:
    if not ids:
        return {}
    rows = await db.execute(select(auth_user.c.id, auth_user.c.name).where(auth_user.c.id.in_(ids)))
    return {row.id: row.name for row in rows}


async def feed(db: AsyncSession, user_id: str, limit: int = 20) -> NewsFeed:
    """What happened while the reader was not looking.

    Derived from the rows that already exist rather than from an event log:
    nothing here is worth writing twice, and an offer that was answered is
    already recorded as answered.
    """
    since = datetime.now() - WINDOW
    entries = [
        *await _offers_waiting(db, user_id),
        *await _offers_answered(db, user_id, since),
        *await _wishlist_moves(db, user_id, since.date()),
    ]
    entries.sort(key=lambda entry: entry.at, reverse=True)
    entries = entries[:limit]

    names = await _names(db, {entry.partner_id for entry in entries if entry.partner_id})
    for entry in entries:
        if entry.partner_id and not entry.detail:
            entry.detail = names.get(entry.partner_id) or "Otro coleccionista"

    return NewsFeed(
        entries=entries,
        waiting=sum(1 for entry in entries if entry.kind == "offer_waiting"),
    )
