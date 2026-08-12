from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from pokedex.db.models import Card, CollectionItem, Scan, WishlistItem, WishlistSource
from pokedex.schemas.activity import ActivityEntry


def _value(price: object, quantity: int = 1) -> float | None:
    return float(price) * quantity if price is not None else None  # type: ignore[arg-type]


async def recent(db: AsyncSession, user_id: str, limit: int = 12) -> list[ActivityEntry]:
    """What the account has done lately, newest first.

    Assembled in Python rather than as one UNION: the three tables share no
    columns worth aligning, and the page never asks for more than a dozen rows.
    """
    entries: list[ActivityEntry] = []

    added = await db.execute(
        select(CollectionItem)
        .options(
            joinedload(CollectionItem.card).joinedload(Card.card_set),
        )
        .where(CollectionItem.user_id == user_id)
        .order_by(CollectionItem.created_at.desc())
        .limit(limit)
    )
    for owned in added.unique().scalars():
        entries.append(
            ActivityEntry(
                kind="added",
                at=owned.created_at,
                card_id=owned.card.id,
                card_name=owned.card.name,
                image_url=owned.card.image_small_url,
                quantity=owned.quantity,
                value_usd=_value(owned.card.price_usd, owned.quantity),
                detail=owned.card.card_set.name,
            )
        )

    scans = list(
        (
            await db.execute(
                select(Scan)
                .where(Scan.user_id == user_id)
                .order_by(Scan.created_at.desc())
                .limit(limit)
            )
        ).scalars()
    )
    resolved = [scan.resolved_card_id for scan in scans if scan.resolved_card_id]
    cards = (
        {
            card.id: card
            for card in (
                await db.execute(select(Card).where(Card.id.in_(resolved)))
            ).scalars()
        }
        if resolved
        else {}
    )
    for scan in scans:
        card = cards.get(scan.resolved_card_id) if scan.resolved_card_id else None
        entries.append(
            ActivityEntry(
                kind="scanned",
                at=scan.created_at,
                card_id=card.id if card else None,
                card_name=card.name if card else None,
                image_url=card.image_small_url if card else None,
                quantity=None,
                value_usd=None,
                detail=scan.status.value,
            )
        )

    suggested = await db.execute(
        select(WishlistItem)
        .options(joinedload(WishlistItem.card))
        .where(
            WishlistItem.user_id == user_id,
            WishlistItem.added_by == WishlistSource.AGENT,
        )
        .order_by(WishlistItem.created_at.desc())
        .limit(limit)
    )
    for wanted in suggested.unique().scalars():
        entries.append(
            ActivityEntry(
                kind="suggested",
                at=wanted.created_at,
                card_id=wanted.card.id,
                card_name=wanted.card.name,
                image_url=wanted.card.image_small_url,
                quantity=None,
                value_usd=_value(wanted.card.price_usd),
                detail=wanted.reason,
            )
        )

    entries.sort(key=lambda entry: entry.at, reverse=True)
    return entries[:limit]
