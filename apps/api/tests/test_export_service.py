import csv
import io

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.integrations.tcgdex import CardPayload, SetPayload, normalize_name
from pokedex.schemas.collection import AddCardRequest, CollectionFilters
from pokedex.services import catalog, collection, export


def card(card_id: str, number: str, name: str) -> CardPayload:
    return CardPayload(
        id=card_id,
        set_id="ex1",
        species_id=None,
        category="Pokemon",
        number=number,
        number_prefix=number,
        name=name,
        name_normalized=normalize_name(name),
        rarity="Rare",
        variants={},
        hp=120,
        image_small_url=None,
        image_large_url=None,
    )


@pytest.fixture
async def stocked(db: AsyncSession, user_id: str) -> AsyncSession:
    await catalog.upsert_sets(
        db,
        [
            SetPayload(
                id="ex1",
                name="Export Set",
                series="Base",
                printed_total=2,
                total=2,
                release_date=None,
                logo_url=None,
                symbol_url=None,
                card_ids=[],
            )
        ],
    )
    await catalog.upsert_cards(db, [card("ex1-1", "1", "Charizard"), card("ex1-2", "2", "Pikachu")])
    await collection.add_card(
        db, user_id, AddCardRequest(card_id="ex1-1", quantity=2, notes="De la caja")
    )
    await collection.add_card(db, user_id, AddCardRequest(card_id="ex1-2"))
    return db


async def test_the_csv_carries_a_header_and_one_row_per_entry(
    stocked: AsyncSession, user_id: str
) -> None:
    items = await collection.list_items(stocked, user_id, CollectionFilters())

    rows = list(csv.DictReader(io.StringIO("".join(export.to_csv(items)))))

    assert len(rows) == 2
    assert set(rows[0]) == set(export.COLUMNS)


async def test_rows_carry_the_card_not_only_its_id(
    stocked: AsyncSession, user_id: str
) -> None:
    """An export of foreign keys is not an export anyone can read."""
    items = await collection.list_items(stocked, user_id, CollectionFilters())
    rows = export.to_rows(items)

    by_name = {row["name"]: row for row in rows}
    assert set(by_name) == {"Charizard", "Pikachu"}
    assert by_name["Charizard"]["set"] == "Export Set"
    assert by_name["Charizard"]["quantity"] == 2
    assert by_name["Charizard"]["notes"] == "De la caja"


async def test_an_empty_collection_still_produces_a_header() -> None:
    assert "".join(export.to_csv([])).strip() == ",".join(export.COLUMNS)
