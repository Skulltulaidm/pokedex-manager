from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import CardSet
from pokedex.integrations.pokeapi import SpeciesPayload
from pokedex.integrations.tcgdex import CardPayload, SetPayload
from pokedex.services import catalog

CHARIZARD_SPECIES = SpeciesPayload(
    id=6,
    name="charizard",
    generation=1,
    types=["fire", "flying"],
    stats={"hp": 78},
    evolution_chain_id=2,
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
    card_ids=["base1-4"],
)

CHARIZARD_CARD = CardPayload(
    id="base1-4",
    set_id="base1",
    species_id=6,
    category="Pokemon",
    number="4",
    number_prefix="4",
    name="Charizard",
    name_normalized="charizard",
    rarity="Rare",
    variants={"holo": True, "normal": False},
    hp=120,
    image_small_url=None,
    image_large_url=None,
)

PROFESSOR_OAK = CardPayload(
    id="base1-88",
    set_id="base1",
    species_id=None,
    category="Trainer",
    number="88",
    number_prefix="88",
    name="Professor Oak",
    name_normalized="professor oak",
    rarity="Rare",
    variants={},
    hp=None,
    image_small_url=None,
    image_large_url=None,
)


@pytest.fixture
async def seeded(db: AsyncSession) -> AsyncSession:
    await catalog.upsert_species(db, [CHARIZARD_SPECIES])
    await catalog.upsert_sets(db, [BASE_SET])
    await catalog.upsert_cards(db, [CHARIZARD_CARD, PROFESSOR_OAK])
    return db


async def test_upsert_sets_stores_the_printed_denominator(db: AsyncSession) -> None:
    assert await catalog.upsert_sets(db, [BASE_SET]) == 1

    stored = await db.get(CardSet, "base1")
    assert stored is not None
    assert stored.printed_total == 102
    assert stored.release_date == date(1999, 1, 9)


async def test_get_card_joins_both_layers(seeded: AsyncSession) -> None:
    card = await catalog.get_card(seeded, "base1-4")

    assert card is not None
    assert card.name == "Charizard"
    assert card.card_set.name == "Base Set"
    assert card.species is not None
    assert card.species.name == "charizard"
    assert card.species.types == ["fire", "flying"]


async def test_get_card_returns_trainer_without_species(seeded: AsyncSession) -> None:
    card = await catalog.get_card(seeded, "base1-88")

    assert card is not None
    assert card.category == "Trainer"
    assert card.species is None
    assert card.card_set.printed_total == 102


async def test_get_card_missing_returns_none(seeded: AsyncSession) -> None:
    assert await catalog.get_card(seeded, "nope-1") is None


async def test_upsert_cards_is_idempotent(seeded: AsyncSession) -> None:
    await catalog.upsert_cards(seeded, [CHARIZARD_CARD])

    card = await catalog.get_card(seeded, "base1-4")
    assert card is not None
    assert card.variants["holo"] is True


async def test_upsert_cards_refreshes_variants(seeded: AsyncSession) -> None:
    updated = CHARIZARD_CARD.model_copy(
        update={"variants": {"holo": True, "reverse": True}}
    )
    await catalog.upsert_cards(seeded, [updated])

    card = await catalog.get_card(seeded, "base1-4")
    assert card is not None
    assert card.variants == {"holo": True, "reverse": True}
