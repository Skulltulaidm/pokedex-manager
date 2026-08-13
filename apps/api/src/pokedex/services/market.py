from collections.abc import Sequence
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import BigInteger, ColumnElement, Select, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from pokedex.db.models import Card, CardPrice, CardSet, CollectionItem, Species
from pokedex.schemas.market import (
    CardMarketContext,
    MarketFilters,
    MarketSummary,
    MarketTypeCount,
    PriceChange,
    SetMarketView,
)

# How far back a reported change looks. Long enough that a weekly sync produces
# one, short enough that the number still describes the present.
WINDOW_DAYS = 30


def _owned_total(user_id: str) -> ColumnElement[int]:
    """Copies of each catalog card the reader holds.

    A correlated subquery rather than an outer join with GROUP BY: grouping would
    force every joined set and species column into the GROUP BY clause, which is
    what stops `joinedload` from working on the same statement.
    """
    return (
        select(func.coalesce(func.sum(CollectionItem.quantity), 0))
        .where(
            CollectionItem.card_id == Card.id,
            CollectionItem.user_id == user_id,
        )
        .correlate(Card)
        .scalar_subquery()
    )


def _first_item(user_id: str) -> ColumnElement[UUID | None]:
    """The oldest holding of each card, for the grid to link to."""
    return (
        select(CollectionItem.id)
        .where(
            CollectionItem.card_id == Card.id,
            CollectionItem.user_id == user_id,
        )
        .order_by(CollectionItem.created_at)
        .limit(1)
        .correlate(Card)
        .scalar_subquery()
    )


def _apply_filters[T](statement: Select[T], filters: MarketFilters, owned: ColumnElement[int]) -> Select[T]:
    if filters.type or filters.generation is not None:
        statement = statement.join(Species, Species.id == Card.species_id)
        if filters.type:
            statement = statement.where(Species.types.contains([filters.type.lower()]))
        if filters.generation is not None:
            statement = statement.where(Species.generation == filters.generation)

    if filters.set_id:
        statement = statement.where(Card.set_id == filters.set_id)
    if filters.search:
        statement = statement.where(Card.name_normalized.ilike(f"%{filters.search.lower()}%"))

    if filters.owned == "owned":
        statement = statement.where(owned > 0)
    elif filters.owned == "missing":
        statement = statement.where(owned == 0)

    return statement


def _set_order() -> tuple[ColumnElement[object], ...]:
    """Set order, numerically.

    `number_prefix` is text, so ordering by it directly runs 1, 10, 100, 11. The
    digits are cast out to sort, and cards whose number is not a plain number
    (promos, star suffixes) fall back to the text after them.
    """
    digits = func.nullif(func.regexp_replace(Card.number_prefix, r"\D", "", "g"), "")
    return (
        Card.set_id,
        cast(digits, BigInteger).nulls_last(),
        Card.number_prefix,
    )


def _order[T](statement: Select[T], filters: MarketFilters, owned: ColumnElement[int]) -> Select[T]:
    set_order = _set_order()

    if filters.sort == "price":
        # NULLS LAST explicitly: Postgres sorts NULLs first under DESC, which
        # would open the grid with the unpriced cards.
        return statement.order_by(Card.price_usd.desc().nulls_last(), *set_order)
    if filters.sort == "name":
        return statement.order_by(Card.name, *set_order)
    if filters.sort == "owned":
        return statement.order_by(owned.desc(), *set_order)

    return statement.order_by(*set_order)


async def list_cards(
    db: AsyncSession, user_id: str, filters: MarketFilters
) -> Sequence[tuple[Card, int, UUID | None]]:
    owned = _owned_total(user_id)
    statement = select(
        Card, owned.label("owned"), _first_item(user_id).label("item_id")
    ).options(joinedload(Card.card_set), joinedload(Card.species))
    statement = _apply_filters(statement, filters, owned)
    statement = _order(statement, filters, owned)
    statement = statement.limit(filters.limit).offset(filters.offset)

    result = await db.execute(statement)
    return [(card, count, item_id) for card, count, item_id in result.unique().all()]


async def count_cards(db: AsyncSession, user_id: str, filters: MarketFilters) -> int:
    owned = _owned_total(user_id)
    statement = _apply_filters(select(func.count()).select_from(Card), filters, owned)
    result = await db.execute(statement)
    return result.scalar_one()


async def _reference_date(
    db: AsyncSession,
    days: int,
    card_id: str | None = None,
    holder_id: str | None = None,
) -> date | None:
    """Oldest reading inside the window, and strictly older than today.

    Without the upper bound a catalog synced once would compare today against
    itself and report a confident 0%, which reads as "flat" rather than "unknown".

    A portfolio's baseline is drawn only from the cards it holds: a card the
    reader does not own has no business setting the date their own value is
    measured from.
    """
    today = date.today()
    statement = select(func.min(CardPrice.recorded_on)).where(
        CardPrice.recorded_on >= today - timedelta(days=days),
        CardPrice.recorded_on < today,
    )
    if card_id is not None:
        statement = statement.where(CardPrice.card_id == card_id)
    if holder_id is not None:
        statement = statement.where(
            CardPrice.card_id.in_(
                select(CollectionItem.card_id).where(CollectionItem.user_id == holder_id)
            )
        )

    return (await db.execute(statement)).scalar_one_or_none()


def _change(since: date, past: Decimal, now: Decimal) -> PriceChange | None:
    if past <= 0:
        return None

    return PriceChange(
        since=since,
        from_value=past,
        to_value=now,
        absolute=now - past,
        percent=float((now - past) / past * 100),
    )


async def portfolio_change(
    db: AsyncSession, user_id: str, days: int = WINDOW_DAYS
) -> PriceChange | None:
    """Movement of what the reader holds.

    Both sides are summed over the cards that had a reading on the reference
    day, so a card the catalog only started pricing later cannot masquerade as
    a gain.
    """
    reference = await _reference_date(db, days, holder_id=user_id)
    if reference is None:
        return None

    owned = _owned_total(user_id)
    past, now = (
        await db.execute(
            select(
                func.coalesce(func.sum(CardPrice.price_usd * owned), 0),
                func.coalesce(func.sum(func.coalesce(Card.price_usd, 0) * owned), 0),
            )
            .select_from(CardPrice)
            .join(Card, Card.id == CardPrice.card_id)
            .where(CardPrice.recorded_on == reference)
        )
    ).one()

    return _change(reference, Decimal(past), Decimal(now))


async def card_change(
    db: AsyncSession, card: Card, days: int = WINDOW_DAYS
) -> PriceChange | None:
    if card.price_usd is None:
        return None

    reference = await _reference_date(db, days, card_id=card.id)
    if reference is None:
        return None

    past = (
        await db.execute(
            select(CardPrice.price_usd).where(
                CardPrice.card_id == card.id,
                CardPrice.recorded_on == reference,
            )
        )
    ).scalar_one_or_none()
    if past is None:
        return None

    return _change(reference, past, card.price_usd)


async def card_context(
    db: AsyncSession, user_id: str, card: Card
) -> CardMarketContext:
    """Rank is by price within the set, so an unpriced card has no rank at all
    rather than being ranked last."""
    owned = _owned_total(user_id)
    price = func.coalesce(Card.price_usd, 0)

    totals = (
        await db.execute(
            select(
                func.count(),
                func.count(Card.price_usd),
                func.coalesce(func.sum(price), 0),
                func.count().filter(owned > 0),
            ).where(Card.set_id == card.set_id)
        )
    ).one()
    cards_in_set, priced_in_set, set_value, owned_in_set = totals

    rank: int | None = None
    if card.price_usd is not None:
        ahead = (
            await db.execute(
                select(func.count()).where(
                    Card.set_id == card.set_id,
                    Card.price_usd > card.price_usd,
                )
            )
        ).scalar_one()
        rank = ahead + 1

    return CardMarketContext(
        price_rank=rank,
        priced_in_set=priced_in_set,
        cards_in_set=cards_in_set,
        owned_in_set=owned_in_set,
        set_value=Decimal(set_value),
        change=await card_change(db, card),
    )


async def set_breakdown(db: AsyncSession, user_id: str) -> list[SetMarketView]:
    """Every set as a position, ordered by what it would cost to finish.

    Held value counts duplicates because that is what the reader owns; missing
    value counts each absent card once because that is what buying it costs.
    """
    owned = _owned_total(user_id)
    price = func.coalesce(Card.price_usd, 0)

    result = await db.execute(
        select(
            CardSet.id,
            CardSet.name,
            func.count(),
            func.count().filter(owned > 0),
            func.coalesce(func.sum(price * owned), 0),
            func.coalesce(func.sum(price).filter(owned == 0), 0),
            func.coalesce(func.sum(price), 0),
        )
        .select_from(Card)
        .join(CardSet, CardSet.id == Card.set_id)
        .group_by(CardSet.id, CardSet.name)
        .order_by(func.coalesce(func.sum(price).filter(owned == 0), 0).desc())
    )

    return [
        SetMarketView(
            set_id=row[0],
            set_name=row[1],
            cards=row[2],
            owned=row[3],
            held_value=Decimal(row[4]),
            missing_value=Decimal(row[5]),
            total_value=Decimal(row[6]),
        )
        for row in result
    ]


async def cheapest_missing(
    db: AsyncSession, user_id: str, set_id: str | None = None, limit: int = 20
) -> Sequence[Card]:
    """The least expensive cards still absent, which is the order anyone
    actually finishes a set in."""
    owned = _owned_total(user_id)
    statement = (
        select(Card)
        .options(joinedload(Card.card_set), joinedload(Card.species))
        .where(owned == 0, Card.price_usd.is_not(None))
        .order_by(Card.price_usd)
        .limit(limit)
    )
    if set_id:
        statement = statement.where(Card.set_id == set_id)

    return (await db.execute(statement)).unique().scalars().all()


async def _types(db: AsyncSession, user_id: str) -> list[MarketTypeCount]:
    """Type facets over the whole catalog, each carrying how many are held.

    The counts the chips show have to match the grid they filter, and the grid is
    the catalog rather than the collection.
    """
    owned = _owned_total(user_id)
    exploded = (
        select(
            func.unnest(Species.types).label("type"),
            (owned > 0).label("held"),
        )
        .select_from(Card)
        .join(Species, Species.id == Card.species_id)
        .subquery()
    )

    result = await db.execute(
        select(
            exploded.c.type,
            func.count().label("total"),
            func.count().filter(exploded.c.held).label("owned"),
        )
        .group_by(exploded.c.type)
        .order_by(func.count().desc(), exploded.c.type)
    )
    return [
        MarketTypeCount(type=row.type, total=row.total, owned=row.owned) for row in result
    ]


async def summary(db: AsyncSession, user_id: str) -> MarketSummary:
    """What the catalog is worth, split by what the reader already holds."""
    owned = _owned_total(user_id)
    price = func.coalesce(Card.price_usd, 0)

    statement = select(
        func.count(),
        func.count().filter(owned > 0),
        func.coalesce(func.sum(price), 0),
        func.coalesce(func.sum(price * owned), 0),
        func.coalesce(func.sum(price).filter(owned == 0), 0),
    ).select_from(Card)

    total, held, catalog_value, owned_value, missing_value = (
        await db.execute(statement)
    ).one()

    return MarketSummary(
        total_cards=total,
        owned_cards=held,
        catalog_value=Decimal(catalog_value),
        owned_value=Decimal(owned_value),
        missing_value=Decimal(missing_value),
        types=await _types(db, user_id),
        change=await portfolio_change(db, user_id),
    )
