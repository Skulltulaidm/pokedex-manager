from collections import defaultdict
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from pokedex.db.models import (
    Card,
    CardCondition,
    CardSet,
    CollectionItem,
    OfferSide,
    OfferStatus,
    TradeOffer,
    TradeOfferCard,
    WishlistItem,
    auth_user,
)
from pokedex.schemas.catalog import CardView
from pokedex.schemas.common import Page
from pokedex.schemas.trade import (
    CollectorProfile,
    CollectorView,
    ConditionCount,
    CreateOfferRequest,
    OfferCardInput,
    OfferCardView,
    ProfileSet,
    SpareCard,
    TradeCard,
    TradeMatch,
    TradeOfferView,
)

# What a copy is worth against a near mint one. These are the ratios the hobby
# trades on rather than anything measured here, so every figure derived from
# them is labelled an estimate wherever it is shown.
CONDITION_VALUE: dict[CardCondition, Decimal] = {
    CardCondition.MINT: Decimal("1.05"),
    CardCondition.NEAR_MINT: Decimal("1.00"),
    CardCondition.LIGHTLY_PLAYED: Decimal("0.85"),
    CardCondition.MODERATELY_PLAYED: Decimal("0.70"),
    CardCondition.HEAVILY_PLAYED: Decimal("0.50"),
    CardCondition.DAMAGED: Decimal("0.35"),
}


def adjusted(price: Decimal | None, condition: CardCondition) -> Decimal | None:
    if price is None:
        return None
    return (price * CONDITION_VALUE[condition]).quantize(Decimal("0.01"))


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


async def find_matches(db: AsyncSession, user_id: str) -> list[TradeMatch]:
    """Counterparties who want a spare card and hold a wanted one.

    Both directions have to be non-empty: wanting what someone has spare is
    half a trade, and half is nothing to propose. Ordered by how many cards
    could move, then by how even the swap is — a big lopsided pile is still a
    worse offer than a small fair one.

    Every match is returned. Cutting the list is a reader's decision, and the
    reader that paginates needs the total to say how many there were.
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
    return matches


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


async def _holdings(db: AsyncSession, user_id: str) -> dict[str, list[ConditionCount]]:
    """Which conditions somebody holds each card in, most pristine first."""
    rows = (
        await db.execute(
            select(
                CollectionItem.card_id,
                CollectionItem.condition,
                func.sum(CollectionItem.quantity),
            )
            .where(CollectionItem.user_id == user_id)
            .group_by(CollectionItem.card_id, CollectionItem.condition)
        )
    ).all()

    order = list(CONDITION_VALUE)
    by_card: defaultdict[str, list[ConditionCount]] = defaultdict(list)
    for card_id, condition, copies in rows:
        by_card[card_id].append(ConditionCount(condition=condition, copies=copies))
    for counts in by_card.values():
        counts.sort(key=lambda entry: order.index(entry.condition))
    return dict(by_card)


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
    if missing := {entry.card_id for entry in request.offered} - mine:
        raise OfferError(f"Not spare in your collection: {', '.join(sorted(missing))}")
    if missing := {entry.card_id for entry in request.requested} - theirs:
        raise OfferError(f"Not spare in theirs: {', '.join(sorted(missing))}")

    my_holdings = await _holdings(db, user_id)
    their_holdings = await _holdings(db, request.to_user_id)

    offer = TradeOffer(
        from_user_id=user_id,
        to_user_id=request.to_user_id,
        message=request.message,
        cards=[
            TradeOfferCard(
                card_id=entry.card_id,
                side=side,
                condition=_settle_condition(entry, holdings),
            )
            for side, entries, holdings in (
                (OfferSide.OFFERED, request.offered, my_holdings),
                (OfferSide.REQUESTED, request.requested, their_holdings),
            )
            for entry in _unique(entries)
        ],
    )
    db.add(offer)
    await db.flush()
    return offer


async def counter_offer(
    db: AsyncSession, user_id: str, offer_id: UUID, request: CreateOfferRequest
) -> TradeOffer | None:
    """Answer an offer with a different one.

    The original is declined in the same breath. Leaving both open would let
    the other side accept the terms that were just turned down, and a
    negotiation where the rejected offer still stands is not a negotiation.

    Only the collector who received it may counter, and the counter always goes
    back to whoever sent the original: an answer has one address.
    """
    original = await db.get(TradeOffer, offer_id)
    if original is None or original.to_user_id != user_id:
        return None
    if original.status is not OfferStatus.PENDING:
        raise OfferError(f"This offer was already {original.status.value}")
    if request.to_user_id != original.from_user_id:
        raise OfferError("A counter answers whoever made the offer")

    countered = await create_offer(db, user_id, request)
    countered.replies_to_id = original.id

    original.status = OfferStatus.DECLINED
    original.responded_at = func.now()
    await db.flush()
    await db.refresh(original, ["responded_at"])
    return countered


def _unique(entries: list[OfferCardInput]) -> list[OfferCardInput]:
    seen: dict[str, OfferCardInput] = {}
    for entry in entries:
        seen.setdefault(entry.card_id, entry)
    return list(seen.values())


def _settle_condition(
    entry: OfferCardInput, holdings: dict[str, list[ConditionCount]]
) -> CardCondition:
    """The state a card goes on the table in.

    Unstated means the worst copy its owner holds: nobody parts with their best
    one while a scuffed duplicate sits in the same binder, and defaulting the
    other way would quietly overstate what the offer is worth.
    """
    available = holdings.get(entry.card_id, [])
    if entry.condition is not None:
        if all(count.condition is not entry.condition for count in available):
            raise OfferError(f"No {entry.condition.value} copy of {entry.card_id}")
        return entry.condition

    return available[-1].condition if available else CardCondition.NEAR_MINT


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

    give = [
        _offer_card(cards[e.card_id], e.condition)
        for e in offer.cards
        if e.side is giving_side
    ]
    get = [
        _offer_card(cards[e.card_id], e.condition)
        for e in offer.cards
        if e.side is not giving_side
    ]
    give_value = sum((entry.adjusted_usd or Decimal(0) for entry in give), Decimal(0))
    get_value = sum((entry.adjusted_usd or Decimal(0) for entry in get), Decimal(0))
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
        replies_to_id=offer.replies_to_id,
        created_at=offer.created_at,
        responded_at=offer.responded_at,
    )


def _offer_card(card: Card, condition: CardCondition) -> OfferCardView:
    return OfferCardView(
        card=CardView.model_validate(card),
        condition=condition,
        price_usd=card.price_usd,
        adjusted_usd=adjusted(card.price_usd, condition),
    )


def _mentions(text: str, match: TradeMatch) -> bool:
    haystack = [match.partner_name or ""] + [
        entry.card.name for entry in match.you_give + match.you_get
    ]
    return any(text in value.lower() for value in haystack)


async def match_page(
    db: AsyncSession,
    user_id: str,
    *,
    search: str | None = None,
    favourable: bool | None = None,
    limit: int = 10,
    offset: int = 0,
) -> Page[TradeMatch]:
    """Matches as a page, filtered before it is cut.

    Filtering happens over the whole set rather than the page: a search that
    only looked at the rows already on screen would answer a different question
    than the one being asked.
    """
    matches = await find_matches(db, user_id)

    if search and (needle := search.strip().lower()):
        matches = [match for match in matches if _mentions(needle, match)]
    if favourable is not None:
        matches = [match for match in matches if (match.balance >= 0) is favourable]

    return Page(
        items=matches[offset : offset + limit],
        total=len(matches),
        limit=limit,
        offset=offset,
    )


async def offer_page(
    db: AsyncSession,
    user_id: str,
    *,
    status: OfferStatus | None = None,
    direction: str | None = None,
    limit: int = 10,
    offset: int = 0,
) -> Page[TradeOfferView]:
    offers = await list_offers(db, user_id, status=status)
    if direction is not None:
        offers = [offer for offer in offers if offer.direction == direction]

    return Page(
        items=offers[offset : offset + limit],
        total=len(offers),
        limit=limit,
        offset=offset,
    )


async def spare_page(
    db: AsyncSession,
    owner_id: str,
    *,
    viewer_id: str,
    search: str | None = None,
    wanted_only: bool = False,
    limit: int = 24,
    offset: int = 0,
) -> Page[SpareCard]:
    """What one collector has free to trade, as the other sees it.

    `wanted` marks the cards the viewer has on their want list, which is the
    only ordering that matters when you are shopping: what you came for first.
    """
    spares = _spares().subquery()
    wants = select(WishlistItem.card_id).where(WishlistItem.user_id == viewer_id)

    holdings = await _holdings(db, owner_id)
    wanted = Card.id.in_(wants)
    statement = (
        select(Card, spares.c.copies, wanted)
        .join(spares, spares.c.card_id == Card.id)
        .options(joinedload(Card.card_set), joinedload(Card.species))
        .where(spares.c.user_id == owner_id)
    )
    if search and (needle := search.strip().lower()):
        statement = statement.where(Card.name_normalized.ilike(f"%{needle}%"))
    if wanted_only:
        statement = statement.where(wanted)

    total = (
        await db.execute(
            select(func.count()).select_from(statement.order_by(None).subquery())
        )
    ).scalar_one()

    rows = (
        await db.execute(
            statement.order_by(wanted.desc(), Card.price_usd.desc().nulls_last(), Card.id)
            .limit(limit)
            .offset(offset)
        )
    ).unique().all()

    return Page(
        items=[
            SpareCard(
                card=CardView.model_validate(card),
                copies=copies,
                price_usd=card.price_usd,
                wanted=is_wanted,
                conditions=holdings.get(card.id, []),
            )
            for card, copies, is_wanted in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


async def collector_page(
    db: AsyncSession,
    user_id: str,
    *,
    search: str | None = None,
    limit: int = 12,
    offset: int = 0,
) -> Page[CollectorView]:
    """Everyone with something free to trade, and how they line up with you.

    Listed whether or not a swap already works out: a collector holding a card
    you want is worth seeing even when you have nothing they asked for, because
    an offer is how you find out what they would take.
    """
    spares = _spares().subquery()
    my_spare_ids = select(spares.c.card_id).where(spares.c.user_id == user_id)
    my_wants = select(WishlistItem.card_id).where(WishlistItem.user_id == user_id)

    statement = (
        select(
            spares.c.user_id,
            auth_user.c.name,
            func.count().label("spares"),
            func.count().filter(spares.c.card_id.in_(my_wants)).label("you_want"),
        )
        .join(auth_user, auth_user.c.id == spares.c.user_id)
        .where(spares.c.user_id != user_id)
        .group_by(spares.c.user_id, auth_user.c.name)
    )
    if search and (needle := search.strip().lower()):
        statement = statement.where(func.lower(auth_user.c.name).like(f"%{needle}%"))

    rows = (await db.execute(statement)).all()

    theirs_wanted: dict[str, int] = {
        row[0]: row[1]
        for row in (
            await db.execute(
                select(WishlistItem.user_id, func.count())
                .where(
                    WishlistItem.user_id != user_id,
                    WishlistItem.card_id.in_(my_spare_ids),
                )
                .group_by(WishlistItem.user_id)
            )
        ).all()
    }

    collectors = [
        CollectorView(
            user_id=partner,
            name=name,
            spares=spares_count,
            you_want=you_want,
            they_want=theirs_wanted.get(partner, 0),
        )
        for partner, name, spares_count, you_want in rows
    ]
    collectors.sort(key=lambda c: (-(c.you_want + c.they_want), -c.spares))

    return Page(
        items=collectors[offset : offset + limit],
        total=len(collectors),
        limit=limit,
        offset=offset,
    )


async def collector_profile(
    db: AsyncSession, owner_id: str, *, viewer_id: str
) -> CollectorProfile | None:
    """One collector, described by what a counterparty needs to know.

    The totals are counts, never money: how much someone's collection is worth
    is theirs to say. Reading your own profile shows the same figures, so the
    page never claims to be something it is not when you send someone the link.
    """
    owner = (
        await db.execute(
            select(auth_user.c.id, auth_user.c.name).where(auth_user.c.id == owner_id)
        )
    ).first()
    if owner is None:
        return None

    totals = (
        await db.execute(
            select(
                func.coalesce(func.sum(CollectionItem.quantity), 0),
                func.count(func.distinct(CollectionItem.card_id)),
                func.min(CollectionItem.created_at),
            ).where(CollectionItem.user_id == owner_id)
        )
    ).one()

    spares = _spares().subquery()
    spare_count = (
        await db.execute(
            select(func.count()).select_from(spares).where(spares.c.user_id == owner_id)
        )
    ).scalar_one()

    wants = (
        await db.execute(
            select(func.count()).where(WishlistItem.user_id == owner_id)
        )
    ).scalar_one()

    viewer_wants = select(WishlistItem.card_id).where(WishlistItem.user_id == viewer_id)
    you_want = (
        await db.execute(
            select(func.count())
            .select_from(spares)
            .where(spares.c.user_id == owner_id, spares.c.card_id.in_(viewer_wants))
        )
    ).scalar_one()

    viewer_spares = select(spares.c.card_id).where(spares.c.user_id == viewer_id)
    they_want = (
        await db.execute(
            select(func.count()).where(
                WishlistItem.user_id == owner_id,
                WishlistItem.card_id.in_(viewer_spares),
            )
        )
    ).scalar_one()

    set_rows = (
        await db.execute(
            select(
                CardSet.id,
                CardSet.name,
                CardSet.printed_total,
                func.count(func.distinct(CollectionItem.card_id)),
            )
            .join(Card, Card.set_id == CardSet.id)
            .join(CollectionItem, CollectionItem.card_id == Card.id)
            .where(CollectionItem.user_id == owner_id)
            .group_by(CardSet.id, CardSet.name, CardSet.printed_total)
            .order_by(func.count(func.distinct(CollectionItem.card_id)).desc())
        )
    ).all()

    return CollectorProfile(
        user_id=owner_id,
        name=owner[1],
        is_self=owner_id == viewer_id,
        joined_at=totals[2],
        cards=totals[0],
        distinct_cards=totals[1],
        spares=spare_count,
        wants=wants,
        you_want=you_want,
        they_want=they_want,
        sets=[
            ProfileSet(
                set_id=set_id, set_name=name, owned=owned, printed_total=printed_total
            )
            for set_id, name, printed_total, owned in set_rows
        ],
    )
