from collections.abc import Iterable, Mapping, Sequence
from datetime import date, timedelta
from decimal import Decimal
from itertools import accumulate
from typing import Any
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    ColumnElement,
    ScalarSelect,
    Select,
    SQLColumnExpression,
    Subquery,
    case,
    cast,
    func,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from pokedex.db.models import Card, CardPrice, CardSet, CollectionItem, Species
from pokedex.schemas.catalog import CardView
from pokedex.schemas.market import (
    CardMarketContext,
    ConcentrationBucket,
    MarketFilters,
    MarketSummary,
    MarketTypeCount,
    PortfolioConcentration,
    PortfolioReturn,
    PositionFilters,
    PositionView,
    PriceChange,
    SetMarketView,
    TradeSimulation,
    TradeSimulationRequest,
)

# How far back a reported change looks. Long enough that a weekly sync produces
# one, short enough that the number still describes the present.
WINDOW_DAYS = 30

# Sizes the concentration is reported at: round numbers a reader can weigh
# against each other, rather than a curve nobody reads off a screen.
CONCENTRATION_BUCKETS = (1, 3, 5, 10)

CENTS = Decimal("0.01")


class UnknownCardError(LookupError):
    """A card named in a hypothetical trade is absent from the catalog."""


class InsufficientCopiesError(ValueError):
    """The trade gives away more copies of a card than are held."""

    def __init__(self, card_id: str, held: int, requested: int) -> None:
        super().__init__(f"Holds {held} copies of {card_id}, cannot give {requested}")
        self.card_id = card_id
        self.held = held
        self.requested = requested


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


def _first_item(user_id: str) -> ScalarSelect[UUID]:
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


def _apply_filters[T: tuple[Any, ...]](
    statement: Select[T], filters: MarketFilters, owned: ColumnElement[int]
) -> Select[T]:
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


def _set_order() -> tuple[SQLColumnExpression[Any], ...]:
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


def _order[T: tuple[Any, ...]](
    statement: Select[T], filters: MarketFilters, owned: ColumnElement[int]
) -> Select[T]:
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

    holdings = (
        await db.execute(
            select(CollectionItem.id, CollectionItem.quantity)
            .where(
                CollectionItem.card_id == card.id,
                CollectionItem.user_id == user_id,
            )
            .order_by(CollectionItem.created_at)
        )
    ).all()

    return CardMarketContext(
        price_rank=rank,
        priced_in_set=priced_in_set,
        cards_in_set=cards_in_set,
        owned_in_set=owned_in_set,
        set_value=Decimal(set_value),
        owned=sum(quantity for _, quantity in holdings),
        item_id=holdings[0][0] if holdings else None,
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


async def portfolio_return(db: AsyncSession, user_id: str) -> PortfolioReturn | None:
    """Held value against what it cost.

    Both sides are summed over the same copies — the ones carrying a cost — so
    an unpriced or uncosted holding cannot land on only one side of the
    subtraction and invent a gain.
    """
    costed = CollectionItem.unit_cost_usd.isnot(None)
    quantity = CollectionItem.quantity

    cost, value, positions, uncosted = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(CollectionItem.unit_cost_usd * quantity).filter(costed), 0
                ),
                func.coalesce(
                    func.sum(func.coalesce(Card.price_usd, 0) * quantity).filter(costed), 0
                ),
                func.count().filter(costed),
                func.count().filter(CollectionItem.unit_cost_usd.is_(None)),
            )
            .select_from(CollectionItem)
            .join(Card, Card.id == CollectionItem.card_id)
            .where(CollectionItem.user_id == user_id)
        )
    ).one()

    if not positions or cost <= 0:
        return None

    cost, value = Decimal(cost), Decimal(value)
    return PortfolioReturn(
        cost_basis=cost,
        market_value=value,
        absolute=value - cost,
        percent=float((value - cost) / cost * 100),
        positions=positions,
        positions_without_cost=uncosted,
    )


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
        performance=await portfolio_return(db, user_id),
    )


def _holding_groups(user_id: str) -> Subquery:
    """One row per held card: the copies, and what the costed ones cost.

    Copies kept in different conditions collapse into a single position, because
    a portfolio is read by card and the sleeve a copy sits in does not move the
    money. The cost sums only the copies carrying one, so a group catalogued
    without a price leaves the basis alone instead of counting as free.
    """
    costed = CollectionItem.unit_cost_usd.isnot(None)
    return (
        select(
            CollectionItem.card_id.label("card_id"),
            func.sum(CollectionItem.quantity).label("quantity"),
            func.coalesce(
                func.sum(CollectionItem.unit_cost_usd * CollectionItem.quantity).filter(costed),
                0,
            ).label("cost_basis"),
            func.coalesce(func.sum(CollectionItem.quantity).filter(costed), 0).label(
                "costed_quantity"
            ),
        )
        .where(CollectionItem.user_id == user_id)
        .group_by(CollectionItem.card_id)
        .subquery()
    )


def _position_order[T: tuple[Any, ...]](
    statement: Select[T], filters: PositionFilters, groups: Subquery
) -> Select[T]:
    price = func.coalesce(Card.price_usd, 0)
    # Null rather than zero wherever no copy carries a cost: a position that
    # cannot be measured must not sort among the ones that broke even.
    gain = case(
        (
            groups.c.costed_quantity > 0,
            price * groups.c.costed_quantity - groups.c.cost_basis,
        ),
        else_=None,
    )
    columns: dict[str, SQLColumnExpression[Any]] = {
        "value": price * groups.c.quantity,
        "gain": gain,
        "gain_percent": case((groups.c.cost_basis > 0, gain / groups.c.cost_basis), else_=None),
        "cost": case((groups.c.costed_quantity > 0, groups.c.cost_basis), else_=None),
        "quantity": groups.c.quantity,
        "name": Card.name,
    }

    column = columns[filters.sort]
    ordered = column.asc() if filters.direction == "asc" else column.desc()
    # Every ordering ends on the id: a tie with no tiebreaker lets a row appear
    # on two pages or on neither.
    return statement.order_by(ordered.nulls_last(), Card.id)


def _position(
    card: Card,
    quantity: int,
    cost_basis: Decimal,
    costed_quantity: int,
    portfolio: Decimal,
) -> PositionView:
    price = card.price_usd
    value = None if price is None else price * quantity
    cost = cost_basis if costed_quantity else None

    gain: Decimal | None = None
    percent: float | None = None
    if price is not None and cost is not None and cost > 0:
        gain = price * costed_quantity - cost
        percent = float(gain / cost * 100)

    return PositionView(
        card=CardView.model_validate(card),
        quantity=quantity,
        costed_quantity=costed_quantity,
        unit_cost_usd=None if cost is None else (cost / costed_quantity).quantize(CENTS),
        cost_basis=cost,
        market_value=value,
        gain_absolute=gain,
        gain_percent=percent,
        portfolio_share=float(value / portfolio * 100) if value and portfolio > 0 else 0.0,
    )


async def portfolio_value(db: AsyncSession, user_id: str) -> Decimal:
    """What every copy held is worth at today's prices."""
    total = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(func.coalesce(Card.price_usd, 0) * CollectionItem.quantity), 0
                )
            )
            .select_from(CollectionItem)
            .join(Card, Card.id == CollectionItem.card_id)
            .where(CollectionItem.user_id == user_id)
        )
    ).scalar_one()
    return Decimal(total)


async def count_positions(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(
        select(func.count(func.distinct(CollectionItem.card_id))).where(
            CollectionItem.user_id == user_id
        )
    )
    return result.scalar_one()


async def list_positions(
    db: AsyncSession, user_id: str, filters: PositionFilters
) -> list[PositionView]:
    """One page of holdings, each as a position.

    The share is measured against the whole portfolio rather than the page, so
    the third page still says what a position is worth in the round.
    """
    groups = _holding_groups(user_id)
    statement = (
        select(Card, groups.c.quantity, groups.c.cost_basis, groups.c.costed_quantity)
        .join(groups, groups.c.card_id == Card.id)
        .options(joinedload(Card.card_set), joinedload(Card.species))
    )
    statement = _position_order(statement, filters, groups)
    statement = statement.limit(filters.limit).offset(filters.offset)

    portfolio = await portfolio_value(db, user_id)
    rows = (await db.execute(statement)).unique().all()
    return [
        _position(card, quantity, Decimal(cost_basis), costed, portfolio)
        for card, quantity, cost_basis, costed in rows
    ]


async def _holdings(db: AsyncSession, user_id: str) -> dict[str, tuple[int, Decimal | None]]:
    """Copies and unit price of every held card, keyed by card."""
    result = await db.execute(
        select(CollectionItem.card_id, func.sum(CollectionItem.quantity), Card.price_usd)
        .join(Card, Card.id == CollectionItem.card_id)
        .where(CollectionItem.user_id == user_id)
        .group_by(CollectionItem.card_id, Card.price_usd)
    )
    return {card_id: (quantity, price) for card_id, quantity, price in result}


def _concentration_of(
    holdings: Mapping[str, tuple[int, Decimal | None]],
) -> PortfolioConcentration:
    values = sorted(
        (price * quantity for quantity, price in holdings.values() if price is not None),
        reverse=True,
    )
    total = sum(values, Decimal(0))
    unpriced = sum(1 for _, price in holdings.values() if price is None)

    if total <= 0:
        return PortfolioConcentration(
            total_value=total,
            priced_positions=len(values),
            unpriced_positions=unpriced,
            buckets=[],
            cards_for_half=None,
        )

    cumulative = list(accumulate(values))
    # A bucket as wide as the portfolio says 100% of the value is in all of it,
    # which is arithmetic rather than information.
    buckets = [
        ConcentrationBucket(
            cards=size,
            value=cumulative[size - 1],
            share=float(cumulative[size - 1] / total * 100),
        )
        for size in CONCENTRATION_BUCKETS
        if size < len(values)
    ]

    return PortfolioConcentration(
        total_value=total,
        priced_positions=len(values),
        unpriced_positions=unpriced,
        buckets=buckets,
        cards_for_half=next(
            index for index, reached in enumerate(cumulative, start=1) if reached * 2 >= total
        ),
    )


async def concentration(db: AsyncSession, user_id: str) -> PortfolioConcentration:
    return _concentration_of(await _holdings(db, user_id))


async def _prices(db: AsyncSession, card_ids: Iterable[str]) -> dict[str, Decimal | None]:
    wanted = set(card_ids)
    if not wanted:
        return {}

    rows = (await db.execute(select(Card.id, Card.price_usd).where(Card.id.in_(wanted)))).all()
    found: dict[str, Decimal | None] = {card_id: price for card_id, price in rows}

    missing = sorted(wanted - found.keys())
    if missing:
        raise UnknownCardError(missing[0])

    return found


async def simulate_trade(
    db: AsyncSession, user_id: str, request: TradeSimulationRequest
) -> TradeSimulation:
    """The portfolio as a swap would leave it.

    Nothing is written and nothing is reserved: the answer is arithmetic over
    today's holdings at today's prices, which is what makes it worth asking
    before agreeing to anything.
    """
    holdings = await _holdings(db, user_id)
    prices = await _prices(db, [leg.card_id for leg in (*request.give, *request.receive)])

    after = dict(holdings)
    give_value = Decimal(0)
    for leg in request.give:
        held, price = after.get(leg.card_id, (0, prices[leg.card_id]))
        if leg.quantity > held:
            raise InsufficientCopiesError(leg.card_id, held, leg.quantity)
        after[leg.card_id] = (held - leg.quantity, price)
        if price is not None:
            give_value += price * leg.quantity

    receive_value = Decimal(0)
    for leg in request.receive:
        held = after.get(leg.card_id, (0, None))[0]
        price = prices[leg.card_id]
        after[leg.card_id] = (held + leg.quantity, price)
        if price is not None:
            receive_value += price * leg.quantity

    return TradeSimulation(
        before=_concentration_of(holdings),
        after=_concentration_of({
            card_id: holding for card_id, holding in after.items() if holding[0] > 0
        }),
        give_value=give_value,
        receive_value=receive_value,
        value_delta=receive_value - give_value,
        unpriced_cards=sorted(card_id for card_id, price in prices.items() if price is None),
    )
