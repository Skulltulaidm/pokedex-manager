from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import Card, CardPrice, CardSet
from pokedex.integrations.tcgdex import CardPayload, SetPayload
from pokedex.services import prices

SET_ID = "t-price"
CARD_ID = "t-price-1"

SET_PAYLOAD = SetPayload(
    id=SET_ID,
    name="Precios",
    series="Test",
    printed_total=1,
    total=1,
    release_date=date(1999, 1, 9),
    logo_url=None,
    symbol_url=None,
    card_ids=[CARD_ID],
)

CARD_PAYLOAD = CardPayload(
    id=CARD_ID,
    set_id=SET_ID,
    species_id=None,
    category="Pokemon",
    number="1",
    number_prefix="1",
    name="Charizard",
    name_normalized="charizard",
    rarity="Rare",
    variants={},
    hp=120,
    image_small_url=None,
    image_large_url=None,
    price_usd=Decimal("900.00"),
)


class FakeTcgdex:
    """Stands in for the catalog: a price reading must not reach the network."""

    def __init__(self, card: CardPayload = CARD_PAYLOAD) -> None:
        self.card = card
        self.sets_fetched: list[str] = []

    async def __aenter__(self) -> "FakeTcgdex":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def fetch_set(self, set_id: str) -> SetPayload:
        self.sets_fetched.append(set_id)
        return SET_PAYLOAD

    async def fetch_card(self, card_id: str) -> CardPayload:
        return self.card


@pytest.fixture
async def catalog_without_readings(db: AsyncSession) -> AsyncSession:
    """The seeded catalog already carries today's reading, which is the exact
    condition the refresh refuses to work under."""
    await db.execute(delete(CardPrice))
    db.add(CardSet(id=SET_ID, name="Precios", printed_total=1, total=1))
    await db.flush()
    db.add(
        Card(
            id=CARD_ID,
            set_id=SET_ID,
            category="Pokemon",
            number="1",
            number_prefix="1",
            name="Charizard",
            name_normalized="charizard",
            variants={},
        )
    )
    await db.flush()
    return db


async def count_sets(db: AsyncSession) -> int:
    return await db.scalar(select(func.count()).select_from(CardSet)) or 0


async def readings_for(db: AsyncSession, card_id: str = CARD_ID) -> list[Decimal]:
    rows = await db.scalars(
        select(CardPrice.price_usd)
        .where(CardPrice.card_id == card_id)
        .order_by(CardPrice.recorded_on)
    )
    return list(rows.all())


async def test_every_cached_set_is_read(catalog_without_readings: AsyncSession) -> None:
    db = catalog_without_readings
    client = FakeTcgdex()

    report = await prices.refresh_prices(db, client)  # type: ignore[arg-type]

    assert report.skipped is False
    assert report.sets == await count_sets(db)
    assert SET_ID in client.sets_fetched
    assert await readings_for(db) == [Decimal("900.00")]


async def test_the_day_is_only_read_once(catalog_without_readings: AsyncSession) -> None:
    db = catalog_without_readings
    db.add(CardPrice(card_id=CARD_ID, recorded_on=date.today(), price_usd=Decimal("800.00")))
    await db.flush()
    client = FakeTcgdex()

    report = await prices.refresh_prices(db, client)  # type: ignore[arg-type]

    assert report.skipped is True
    assert client.sets_fetched == []
    assert await readings_for(db) == [Decimal("800.00")]


async def test_yesterdays_reading_does_not_stand_in_for_todays(
    catalog_without_readings: AsyncSession,
) -> None:
    db = catalog_without_readings
    db.add(
        CardPrice(
            card_id=CARD_ID,
            recorded_on=date.today() - timedelta(days=1),
            price_usd=Decimal("800.00"),
        )
    )
    await db.flush()

    report = await prices.refresh_prices(db, FakeTcgdex())  # type: ignore[arg-type]

    assert report.skipped is False
    assert await readings_for(db) == [Decimal("800.00"), Decimal("900.00")]


async def test_a_card_without_a_price_is_not_a_zero(
    catalog_without_readings: AsyncSession,
) -> None:
    db = catalog_without_readings
    unpriced = CardPayload(**{**CARD_PAYLOAD.__dict__, "price_usd": None})

    report = await prices.refresh_prices(db, FakeTcgdex(unpriced))  # type: ignore[arg-type]

    assert report.cards == 0
    assert await readings_for(db) == []


async def test_an_empty_catalog_is_not_read(db: AsyncSession) -> None:
    # Truncate rather than delete: everything hangs off the catalog, and this is
    # transactional in Postgres, so the rollback still puts it all back.
    await db.execute(text("TRUNCATE pokedex.card_set CASCADE"))
    client = FakeTcgdex()

    report = await prices.refresh_prices(db, client)  # type: ignore[arg-type]

    assert report.skipped is True
    assert client.sets_fetched == []
