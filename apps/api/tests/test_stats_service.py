from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.integrations.pokeapi import SpeciesPayload
from pokedex.integrations.tcgdex import CardPayload, SetPayload
from pokedex.schemas.collection import AddCardRequest
from pokedex.services import catalog, collection, stats

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

BASE_SET = SetPayload(
    id="base1",
    name="Base Set",
    series="Base",
    printed_total=102,
    total=102,
    release_date=date(1999, 1, 9),
    logo_url=None,
    symbol_url=None,
    card_ids=[],
)


def card(card_id: str, species_id: int, name: str, number: str) -> CardPayload:
    return CardPayload(
        id=card_id,
        set_id="base1",
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
    )


@pytest.fixture
async def stocked(db: AsyncSession, user_id: str) -> AsyncSession:
    await catalog.upsert_species(db, [CHARIZARD, SQUIRTLE, CHIKORITA])
    await catalog.upsert_sets(db, [BASE_SET])
    await catalog.upsert_cards(
        db,
        [
            card("base1-4", 6, "Charizard", "4"),
            card("base1-63", 7, "Squirtle", "63"),
            card("base1-99", 152, "Chikorita", "99"),
        ],
    )
    await collection.add_card(db, user_id, AddCardRequest(card_id="base1-4", quantity=3))
    await collection.add_card(db, user_id, AddCardRequest(card_id="base1-63"))
    return db


async def test_totals_count_groups_and_copies(
    stocked: AsyncSession, user_id: str
) -> None:
    result = await stats.collection_stats(stocked, user_id)

    assert result.total_groups == 2
    assert result.total_cards == 4


async def test_types_counts_every_type_a_card_carries(
    stocked: AsyncSession, user_id: str
) -> None:
    result = await stats.collection_stats(stocked, user_id)
    counts = {entry.type: entry.count for entry in result.types}

    # Charizard is fire *and* flying, so it contributes to both.
    assert counts == {"fire": 1, "flying": 1, "water": 1}


async def test_generations_group_owned_cards(
    stocked: AsyncSession, user_id: str
) -> None:
    result = await stats.collection_stats(stocked, user_id)

    assert [(entry.generation, entry.count) for entry in result.generations] == [(1, 2)]


async def test_set_coverage_reports_owned_slots(
    stocked: AsyncSession, user_id: str
) -> None:
    result = await stats.collection_stats(stocked, user_id)

    assert len(result.sets) == 1
    coverage = result.sets[0]
    assert coverage.set_id == "base1"
    assert coverage.printed_total == 102
    assert coverage.owned == 2
    assert sorted(slot.number for slot in coverage.owned_slots) == ["4", "63"]
    # The type rides along with the number so the client can colour each slot.
    assert {slot.number: slot.type for slot in coverage.owned_slots} == {
        "4": "fire",
        "63": "water",
    }


async def test_stats_are_empty_for_a_new_user(
    stocked: AsyncSession, other_user_id: str
) -> None:
    result = await stats.collection_stats(stocked, other_user_id)

    assert result.total_groups == 0
    assert result.total_cards == 0
    assert result.types == []
    assert result.sets == []
