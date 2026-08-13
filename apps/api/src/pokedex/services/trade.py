from collections import defaultdict
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from pokedex.db.models import (
    Card,
    CollectionItem,
    OfferSide,
    OfferStatus,
    TradeOffer,
    TradeOfferCard,
    WishlistItem,
    auth_user,
)
from pokedex.schemas.catalog import CardView
from pokedex.schemas.trade import (
    CreateOfferRequest,
    OfferCardView,
    TradeCard,
    TradeMatch,
    TradeOfferView,
)


class OfferError(RuntimeError):
    """An offer that the rules do not allow."""


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


async def _spare_ids(db: AsyncSession, user_id: str) -> set[str]:
    # One subquery, referenced twice. Building it per reference would put two
    # unrelated copies in the statement and cross join them.
    spares = _spares().subquery()
    rows = await db.execute(
        select(spares.c.card_id).where(spares.c.user_id == user_id)
    )
    return set(rows.scalars())


async def create_offer(
    db: AsyncSession, user_id: str, request: CreateOfferRequest
) -> TradeOffer:
    """Propose a swap to another collector.

    Both sides are checked against what each of them actually has spare. An
    offer naming a card its owner does not hold twice is not a hard error
    anywhere downstream — it is simply a promise neither of them can keep, and
    it is cheaper to refuse it here than to discover it in a car park.
    """
    if request.to_user_id == user_id:
        raise OfferError("An offer needs two collectors")

    mine, theirs = await _spare_ids(db, user_id), await _spare_ids(db, request.to_user_id)
    if missing := set(request.offered) - mine:
        raise OfferError(f"Not spare in your collection: {', '.join(sorted(missing))}")
    if missing := set(request.requested) - theirs:
        raise OfferError(f"Not spare in theirs: {', '.join(sorted(missing))}")

    offer = TradeOffer(
        from_user_id=user_id,
        to_user_id=request.to_user_id,
        message=request.message,
        cards=[
            TradeOfferCard(card_id=card_id, side=side)
            for side, ids in (
                (OfferSide.OFFERED, request.offered),
                (OfferSide.REQUESTED, request.requested),
            )
            for card_id in dict.fromkeys(ids)
        ],
    )
    db.add(offer)
    await db.flush()
    return offer


async def respond_to_offer(
    db: AsyncSession, user_id: str, offer_id: UUID, accept: bool
) -> TradeOffer | None:
    """Accept or decline. Only the collector who received it may.

    Accepting records agreement and moves no cards: the collection is what
    somebody physically holds, and only they know whether the swap happened.
    """
    offer = await db.get(TradeOffer, offer_id)
    if offer is None or offer.to_user_id != user_id:
        return None
    if offer.status is not OfferStatus.PENDING:
        raise OfferError(f"This offer was already {offer.status.value}")

    offer.status = OfferStatus.ACCEPTED if accept else OfferStatus.DECLINED
    offer.responded_at = func.now()
    await db.flush()
    # The stamp is the database's, so the object has to read back what it wrote.
    await db.refresh(offer, ["responded_at"])
    return offer


async def withdraw_offer(
    db: AsyncSession, user_id: str, offer_id: UUID
) -> TradeOffer | None:
    """Pull an offer back. Only its author, and only while it is unanswered."""
    offer = await db.get(TradeOffer, offer_id)
    if offer is None or offer.from_user_id != user_id:
        return None
    if offer.status is not OfferStatus.PENDING:
        raise OfferError(f"This offer was already {offer.status.value}")

    offer.status = OfferStatus.WITHDRAWN
    offer.responded_at = func.now()
    await db.flush()
    await db.refresh(offer, ["responded_at"])
    return offer


async def list_offers(
    db: AsyncSession, user_id: str, status: OfferStatus | None = None
) -> list[TradeOfferView]:
    """Every offer the reader is party to, newest first, in either direction."""
    statement = (
        select(TradeOffer)
        .options(selectinload(TradeOffer.cards))
        .where(or_(TradeOffer.from_user_id == user_id, TradeOffer.to_user_id == user_id))
        .order_by(TradeOffer.created_at.desc())
    )
    if status is not None:
        statement = statement.where(TradeOffer.status == status)

    offers = list((await db.execute(statement)).scalars())
    if not offers:
        return []

    card_ids = {entry.card_id for offer in offers for entry in offer.cards}
    cards = {
        card.id: card
        for card in (
            await db.execute(
                select(Card)
                .options(joinedload(Card.card_set), joinedload(Card.species))
                .where(Card.id.in_(card_ids))
            )
        )
        .unique()
        .scalars()
    }

    partner_ids = {
        offer.to_user_id if offer.from_user_id == user_id else offer.from_user_id
        for offer in offers
    }
    names: dict[str, str | None] = {
        row[0]: row[1]
        for row in (
            await db.execute(
                select(auth_user.c.id, auth_user.c.name).where(auth_user.c.id.in_(partner_ids))
            )
        ).all()
    }

    return [_offer_view(offer, user_id, cards, names) for offer in offers]


def _offer_view(
    offer: TradeOffer,
    user_id: str,
    cards: dict[str, Card],
    names: dict[str, str | None],
) -> TradeOfferView:
    sent = offer.from_user_id == user_id
    # OFFERED always travels from the author. The reader gives it only when the
    # reader is the author; otherwise the same side is what they receive.
    giving_side = OfferSide.OFFERED if sent else OfferSide.REQUESTED

    give = [_offer_card(cards[e.card_id]) for e in offer.cards if e.side is giving_side]
    get = [_offer_card(cards[e.card_id]) for e in offer.cards if e.side is not giving_side]
    give_value = sum((entry.price_usd or Decimal(0) for entry in give), Decimal(0))
    get_value = sum((entry.price_usd or Decimal(0) for entry in get), Decimal(0))
    partner_id = offer.to_user_id if sent else offer.from_user_id

    return TradeOfferView(
        id=offer.id,
        status=offer.status,
        direction="sent" if sent else "received",
        partner_id=partner_id,
        partner_name=names.get(partner_id),
        you_give=sorted(give, key=lambda entry: entry.card.id),
        you_get=sorted(get, key=lambda entry: entry.card.id),
        give_value=give_value,
        get_value=get_value,
        balance=get_value - give_value,
        message=offer.message,
        created_at=offer.created_at,
        responded_at=offer.responded_at,
    )


def _offer_card(card: Card) -> OfferCardView:
    return OfferCardView(card=CardView.model_validate(card), price_usd=card.price_usd)
