from collections import defaultdict
from decimal import Decimal

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from pokedex.db.models import Card, CollectionItem, WishlistItem, auth_user
from pokedex.schemas.catalog import CardView
from pokedex.schemas.trade import TradeCard, TradeMatch


def _spares() -> Select[tuple[str, str, int]]:
    """Every holder's copies beyond the first, per card.

    The first copy is the collection; only what is over it is inventory. A card
    someone owns once never appears here, which is what stops a match from
    proposing that they give up the only one they have.
    """
    return (
        select(
            CollectionItem.user_id,
            CollectionItem.card_id,
            (func.sum(CollectionItem.quantity) - 1).label("copies"),
        )
        .group_by(CollectionItem.user_id, CollectionItem.card_id)
        .having(func.sum(CollectionItem.quantity) > 1)
    )


async def find_matches(db: AsyncSession, user_id: str, limit: int = 10) -> list[TradeMatch]:
    """Counterparties who want a spare card and hold a wanted one.

    Both directions have to be non-empty: wanting what someone has spare is
    half a trade, and half is nothing to propose. Ordered by how many cards
    could move, then by how even the swap is — a big lopsided pile is still a
    worse offer than a small fair one.
    """
    mine = _spares().where(CollectionItem.user_id == user_id).subquery()
    my_spare_ids = select(mine.c.card_id)
    my_wants = select(WishlistItem.card_id).where(WishlistItem.user_id == user_id)

    # What they would take: cards on their want list that the reader has spare.
    taking = (
        await db.execute(
            select(WishlistItem.user_id, WishlistItem.card_id).where(
                WishlistItem.user_id != user_id,
                WishlistItem.card_id.in_(my_spare_ids),
            )
        )
    ).all()

    theirs = _spares().subquery()
    # What they would give: their spare copies of cards the reader wants.
    giving = (
        await db.execute(
            select(theirs.c.user_id, theirs.c.card_id, theirs.c.copies).where(
                theirs.c.user_id != user_id,
                theirs.c.card_id.in_(my_wants),
            )
        )
    ).all()

    partners = {row[0] for row in taking} & {row[0] for row in giving}
    if not partners:
        return []

    my_copies: dict[str, int] = {
        row[0]: row[1] for row in (await db.execute(select(mine.c.card_id, mine.c.copies))).all()
    }

    wanted_ids = {row[1] for row in taking} | {row[1] for row in giving}
    cards = {
        card.id: card
        for card in (
            await db.execute(
                select(Card)
                .options(joinedload(Card.card_set), joinedload(Card.species))
                .where(Card.id.in_(wanted_ids))
            )
        )
        .unique()
        .scalars()
    }
    names: dict[str, str | None] = {
        row[0]: row[1]
        for row in (
            await db.execute(
                select(auth_user.c.id, auth_user.c.name).where(auth_user.c.id.in_(partners))
            )
        ).all()
    }

    give_by_partner: defaultdict[str, list[TradeCard]] = defaultdict(list)
    get_by_partner: defaultdict[str, list[TradeCard]] = defaultdict(list)

    for partner, card_id in taking:
        if partner in partners:
            give_by_partner[partner].append(_entry(cards[card_id], my_copies[card_id]))
    for partner, card_id, copies in giving:
        if partner in partners:
            get_by_partner[partner].append(_entry(cards[card_id], copies))

    matches = [
        _match(partner, names.get(partner), give_by_partner[partner], get_by_partner[partner])
        for partner in partners
    ]
    matches.sort(key=lambda m: (-(len(m.you_give) + len(m.you_get)), abs(m.balance)))
    return matches[:limit]


def _entry(card: Card, copies: int) -> TradeCard:
    return TradeCard(card=CardView.model_validate(card), copies=copies, price_usd=card.price_usd)


def _match(
    partner_id: str,
    partner_name: str | None,
    give: list[TradeCard],
    get: list[TradeCard],
) -> TradeMatch:
    """One copy of each card is what a value counts.

    A spare stack of four does not make an offer four times better — how many
    copies actually move is what the two of them will argue about, so `copies`
    reports what is available and the value stays per card.
    """
    give_value = sum((entry.price_usd or Decimal(0) for entry in give), Decimal(0))
    get_value = sum((entry.price_usd or Decimal(0) for entry in get), Decimal(0))

    return TradeMatch(
        partner_id=partner_id,
        partner_name=partner_name,
        you_give=sorted(give, key=lambda entry: entry.card.id),
        you_get=sorted(get, key=lambda entry: entry.card.id),
        give_value=give_value,
        get_value=get_value,
        balance=get_value - give_value,
        unpriced=sum(1 for entry in give + get if entry.price_usd is None),
    )
