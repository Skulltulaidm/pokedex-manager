from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.integrations.pokeapi import SpeciesPayload
from pokedex.integrations.tcgdex import CardPayload, SetPayload
from pokedex.schemas.collection import AddCardRequest
from pokedex.services import catalog, collection

# The suite shares one Postgres with the synced catalog, so this family lives
# beyond the real dex and beyond any real chain id.
SQUIRTLE_ID = 9007
WARTORTLE_ID = 9008
BLASTOISE_ID = 9009
MEW_ID = 9151
CHAIN_ID = 90003
SET_ID = "testevo"


def species(species_id: int, name: str, chain_id: int | None) -> SpeciesPayload:
    return SpeciesPayload(
        id=species_id,
        name=name,
        generation=1,
        types=["water"],
        stats={"hp": 44},
        evolution_chain_id=chain_id,
        sprite_url=f"https://example.test/{species_id}.png",
    )


def card(card_id: str, species_id: int | None, name: str, number: str) -> CardPayload:
    return CardPayload(
        id=card_id,
        set_id=SET_ID,
        species_id=species_id,
        category="Pokemon" if species_id else "Trainer",
        number=number,
        number_prefix=number,
        name=name,
        name_normalized=name.lower(),
        rarity="Rare",
        variants={},
        hp=100,
        image_small_url=None,
        image_large_url=None,
        price_usd=Decimal("1.00"),
    )


@pytest.fixture
async def stocked(db: AsyncSession, user_id: str) -> AsyncSession:
    """A three-member family and a lone species; the reader holds Blastoise only."""
    await catalog.upsert_species(
        db,
        [
            species(SQUIRTLE_ID, "test-squirtle", CHAIN_ID),
            species(WARTORTLE_ID, "test-wartortle", CHAIN_ID),
            species(BLASTOISE_ID, "test-blastoise", CHAIN_ID),
            species(MEW_ID, "test-mew", None),
        ],
    )
    await catalog.upsert_sets(
        db,
        [
            SetPayload(
                id=SET_ID,
                name="Evolution Test Set",
                series="Base",
                printed_total=4,
                total=4,
                release_date=date(1999, 1, 9),
                logo_url=None,
                symbol_url=None,
                card_ids=[],
            )
        ],
    )
    await catalog.upsert_cards(
        db,
        [
            card(f"{SET_ID}-1", SQUIRTLE_ID, "Squirtle", "1"),
            card(f"{SET_ID}-2", BLASTOISE_ID, "Blastoise", "2"),
            card(f"{SET_ID}-3", MEW_ID, "Mew", "3"),
            card(f"{SET_ID}-4", None, "Professor Oak", "4"),
        ],
    )
    await collection.add_card(
        db, user_id, AddCardRequest(card_id=f"{SET_ID}-2", quantity=1)
    )
    return db


async def test_family_comes_back_in_dex_order(
    stocked: AsyncSession, user_id: str
) -> None:
    family = await catalog.evolution_family(stocked, WARTORTLE_ID, user_id)

    assert [member.name for member, _ in family] == [
        "test-squirtle",
        "test-wartortle",
        "test-blastoise",
    ]


async def test_family_carries_the_sprite_and_types(
    stocked: AsyncSession, user_id: str
) -> None:
    family = await catalog.evolution_family(stocked, SQUIRTLE_ID, user_id)
    first, _ = family[0]

    assert first.id == SQUIRTLE_ID
    assert first.sprite_url == f"https://example.test/{SQUIRTLE_ID}.png"
    assert first.types == ["water"]


async def test_only_the_species_with_a_held_card_is_marked_owned(
    stocked: AsyncSession, user_id: str
) -> None:
    family = await catalog.evolution_family(stocked, SQUIRTLE_ID, user_id)

    assert {member.name: owned for member, owned in family} == {
        "test-squirtle": False,
        "test-wartortle": False,
        "test-blastoise": True,
    }


async def test_another_reader_holds_nothing_of_the_family(
    stocked: AsyncSession, other_user_id: str
) -> None:
    family = await catalog.evolution_family(stocked, SQUIRTLE_ID, other_user_id)

    assert [owned for _, owned in family] == [False, False, False]


async def test_a_species_without_a_chain_has_no_family(
    stocked: AsyncSession, user_id: str
) -> None:
    assert await catalog.evolution_family(stocked, MEW_ID, user_id) == []


async def test_a_chain_of_one_is_not_a_family(
    stocked: AsyncSession, user_id: str
) -> None:
    await catalog.upsert_species(stocked, [species(9152, "test-solo", 90004)])

    assert await catalog.evolution_family(stocked, 9152, user_id) == []


async def test_an_unknown_species_has_no_family(
    stocked: AsyncSession, user_id: str
) -> None:
    assert await catalog.evolution_family(stocked, 999_999, user_id) == []
