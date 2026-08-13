from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import CardPrice
from pokedex.integrations.pokeapi import SpeciesPayload
from pokedex.integrations.tcgdex import CardPayload, SetPayload
from pokedex.schemas.collection import AddCardRequest
from pokedex.schemas.market import MarketFilters
from pokedex.services import catalog, collection, market

CHARIZARD = SpeciesPayload(
    id=6,
    name="charizard",
    generation=1,
    types=["fire", "flying"],
    stats={"hp": 78},
    evolution_chain_id=2,
    sprite_url=None,
)
SQUIRTLE = SpeciesPayload(
    id=7,
    name="squirtle",
    generation=1,
    types=["water"],
    stats={"hp": 44},
    evolution_chain_id=3,
    sprite_url=None,
)
CHIKORITA = SpeciesPayload(
    id=152,
    name="chikorita",
    generation=2,
    types=["grass"],
    stats={"hp": 45},
    evolution_chain_id=78,
    sprite_url=None,
)

# The suite shares one Postgres with the synced catalog, so these tests carry
# their own set and scope every catalog-wide query to it.
SET_ID = "testmkt"

BASE_SET = SetPayload(
    id=SET_ID,
    name="Market Test Set",
    series="Base",
    printed_total=3,
    total=3,
    release_date=date(1999, 1, 9),
    logo_url=None,
    symbol_url=None,
    card_ids=[],
)


def card(
    card_id: str,
    species_id: int,
    name: str,
    number: str,
    price: Decimal | None = None,
) -> CardPayload:
    return CardPayload(
        id=card_id,
        set_id=SET_ID,
        species_id=species_id,
        category="Pokemon",
        number=number,
        number_prefix=number,
        name=name,
        name_normalized=name.lower(),
        rarity="Rare",
        variants={},
        hp=100,
        image_small_url=None,
        image_large_url=None,
        price_usd=price,
    )


def only(**kwargs: object) -> MarketFilters:
    return MarketFilters(set_id=SET_ID, **kwargs)  # type: ignore[arg-type]


@pytest.fixture
async def stocked(db: AsyncSession, user_id: str) -> AsyncSession:
    """Three catalog cards; the reader holds two copies of one and none of the rest."""
    await catalog.upsert_species(db, [CHARIZARD, SQUIRTLE, CHIKORITA])
    await catalog.upsert_sets(db, [BASE_SET])
    await catalog.upsert_cards(
        db,
        [
            card(f"{SET_ID}-4", 6, "Charizard", "4", Decimal("100.00")),
            card(f"{SET_ID}-63", 7, "Squirtle", "63", Decimal("10.00")),
            card(f"{SET_ID}-99", 152, "Chikorita", "99", None),
        ],
    )
    await collection.add_card(
        db, user_id, AddCardRequest(card_id=f"{SET_ID}-4", quantity=2)
    )
    return db


async def test_lists_the_whole_catalog_not_just_holdings(
    stocked: AsyncSession, user_id: str
) -> None:
    rows = await market.list_cards(stocked, user_id, only())

    assert [row[0].id for row in rows] == [
        f"{SET_ID}-4",
        f"{SET_ID}-63",
        f"{SET_ID}-99",
    ]


async def test_marks_how_many_copies_are_held(
    stocked: AsyncSession, user_id: str
) -> None:
    rows = await market.list_cards(stocked, user_id, only())
    held = {row[0].id: row[1] for row in rows}

    assert held == {f"{SET_ID}-4": 2, f"{SET_ID}-63": 0, f"{SET_ID}-99": 0}


async def test_held_cards_carry_an_item_to_link_to(
    stocked: AsyncSession, user_id: str
) -> None:
    rows = await market.list_cards(stocked, user_id, only())
    items = {row[0].id: row[2] for row in rows}

    assert items[f"{SET_ID}-4"] is not None
    assert items[f"{SET_ID}-63"] is None


async def test_missing_filter_excludes_what_is_held(
    stocked: AsyncSession, user_id: str
) -> None:
    rows = await market.list_cards(stocked, user_id, only(owned="missing"))

    assert [row[0].id for row in rows] == [f"{SET_ID}-63", f"{SET_ID}-99"]
    assert await market.count_cards(stocked, user_id, only(owned="missing")) == 2


async def test_owned_filter_keeps_only_holdings(
    stocked: AsyncSession, user_id: str
) -> None:
    rows = await market.list_cards(stocked, user_id, only(owned="owned"))

    assert [row[0].id for row in rows] == [f"{SET_ID}-4"]


async def test_price_sort_puts_unpriced_cards_last(
    stocked: AsyncSession, user_id: str
) -> None:
    rows = await market.list_cards(stocked, user_id, only(sort="price"))

    assert [row[0].id for row in rows] == [
        f"{SET_ID}-4",
        f"{SET_ID}-63",
        f"{SET_ID}-99",
    ]


async def test_summary_splits_catalog_value_by_what_is_held(
    stocked: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """Measured as a delta against a reader holding nothing, because the summary
    spans the whole shared catalog rather than this test's set."""
    baseline = await market.summary(stocked, other_user_id)
    result = await market.summary(stocked, user_id)

    assert result.total_cards == baseline.total_cards
    assert result.owned_cards == 1
    # Two copies of a $100 card, so holdings can exceed the catalog's own value.
    assert result.owned_value == Decimal("200.00")
    assert baseline.missing_value - result.missing_value == Decimal("100.00")
    assert baseline.owned_value == Decimal("0")


async def test_type_filter_reaches_the_species_behind_the_card(
    stocked: AsyncSession, user_id: str
) -> None:
    rows = await market.list_cards(stocked, user_id, only(type="water"))

    assert [row[0].id for row in rows] == [f"{SET_ID}-63"]


async def test_set_order_is_numeric_not_lexicographic(
    stocked: AsyncSession, user_id: str
) -> None:
    """Sorting the text column directly would run 4, 100, 12, 63."""
    await catalog.upsert_cards(
        stocked,
        [
            card(f"{SET_ID}-12", 7, "Squirtle", "12"),
            card(f"{SET_ID}-100", 7, "Squirtle", "100"),
        ],
    )

    rows = await market.list_cards(stocked, user_id, only())

    assert [row[0].number for row in rows] == ["4", "12", "63", "99", "100"]


async def test_card_context_ranks_by_price_inside_the_set(
    stocked: AsyncSession, user_id: str
) -> None:
    squirtle = await catalog.get_card(stocked, f"{SET_ID}-63")
    assert squirtle is not None

    context = await market.card_context(stocked, user_id, squirtle)

    # $10 behind the $100 Charizard, and the unpriced Chikorita never ranks.
    assert context.price_rank == 2
    assert context.priced_in_set == 2
    assert context.cards_in_set == 3
    assert context.owned_in_set == 1
    assert context.set_value == Decimal("110.00")


async def test_card_context_leaves_unpriced_cards_unranked(
    stocked: AsyncSession, user_id: str
) -> None:
    chikorita = await catalog.get_card(stocked, f"{SET_ID}-99")
    assert chikorita is not None

    context = await market.card_context(stocked, user_id, chikorita)

    assert context.price_rank is None


async def record(
    db: AsyncSession, card_id: str, day: date, price: str
) -> None:
    await db.execute(
        insert(CardPrice)
        .values(card_id=card_id, recorded_on=day, price_usd=Decimal(price))
        .on_conflict_do_update(
            index_elements=[CardPrice.card_id, CardPrice.recorded_on],
            set_={"price_usd": Decimal(price)},
        )
    )


async def test_no_change_reported_without_an_earlier_reading(
    stocked: AsyncSession, user_id: str
) -> None:
    """A catalog synced once must report nothing, not a confident zero."""
    await record(stocked, f"{SET_ID}-4", date.today(), "100.00")

    assert await market.portfolio_change(stocked, user_id) is None


async def test_baseline_ignores_readings_for_cards_not_held(
    stocked: AsyncSession, user_id: str
) -> None:
    """An unheld card must not set the date the portfolio is measured from."""
    week_ago = date.today() - timedelta(days=7)
    await record(stocked, f"{SET_ID}-4", week_ago, "80.00")
    # Older reading, but on the Squirtle the reader does not own.
    await record(stocked, f"{SET_ID}-63", week_ago - timedelta(days=5), "5.00")

    change = await market.portfolio_change(stocked, user_id)

    assert change is not None
    assert change.since == week_ago


async def test_portfolio_change_measures_holdings_against_an_older_reading(
    stocked: AsyncSession, user_id: str
) -> None:
    week_ago = date.today() - timedelta(days=7)
    # Two copies held; the card was $80 a week ago and is $100 now.
    await record(stocked, f"{SET_ID}-4", week_ago, "80.00")

    change = await market.portfolio_change(stocked, user_id)

    assert change is not None
    assert change.since == week_ago
    assert change.from_value == Decimal("160.00")
    assert change.to_value == Decimal("200.00")
    assert change.absolute == Decimal("40.00")
    assert change.percent == pytest.approx(25.0)


async def test_change_ignores_readings_outside_the_window(
    stocked: AsyncSession, user_id: str
) -> None:
    await record(stocked, f"{SET_ID}-4", date.today() - timedelta(days=400), "10.00")

    assert await market.portfolio_change(stocked, user_id) is None


async def test_card_change_reports_that_card_alone(
    stocked: AsyncSession, user_id: str
) -> None:
    charizard = await catalog.get_card(stocked, f"{SET_ID}-4")
    assert charizard is not None
    await record(stocked, f"{SET_ID}-4", date.today() - timedelta(days=3), "50.00")

    change = await market.card_change(stocked, charizard)

    assert change is not None
    assert change.from_value == Decimal("50.00")
    assert change.to_value == Decimal("100.00")
    assert change.percent == pytest.approx(100.0)


async def test_recording_prices_twice_in_a_day_overwrites(
    stocked: AsyncSession, user_id: str
) -> None:
    payloads = [card(f"{SET_ID}-4", 6, "Charizard", "4", Decimal("111.00"))]
    await catalog.record_prices(stocked, payloads)
    await catalog.record_prices(stocked, payloads)

    rows = (
        await stocked.execute(
            select(CardPrice.price_usd).where(
                CardPrice.card_id == f"{SET_ID}-4",
                CardPrice.recorded_on == date.today(),
            )
        )
    ).scalars().all()

    assert rows == [Decimal("111.00")]


async def test_recording_prices_skips_cards_without_one(
    stocked: AsyncSession, user_id: str
) -> None:
    written = await catalog.record_prices(
        stocked, [card(f"{SET_ID}-99", 152, "Chikorita", "99", None)]
    )

    assert written == 0


async def test_type_facets_count_the_catalog_and_the_part_held(
    stocked: AsyncSession, user_id: str
) -> None:
    result = await market.summary(stocked, user_id)
    fire = next(entry for entry in result.types if entry.type == "fire")
    water = next(entry for entry in result.types if entry.type == "water")

    # The held Charizard is fire and flying; the Squirtle in this set is not held.
    assert fire.owned >= 1
    assert water.total >= 1
    assert all(entry.owned <= entry.total for entry in result.types)
