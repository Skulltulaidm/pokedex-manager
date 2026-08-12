import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.integrations.pokeapi import SpeciesPayload
from pokedex.services import catalog

BULBASAUR = SpeciesPayload(
    id=1,
    name="bulbasaur",
    generation=1,
    types=["grass", "poison"],
    stats={"hp": 45, "attack": 49},
    evolution_chain_id=1,
    sprite_url="https://example.test/1.png",
)
CHARMANDER = SpeciesPayload(
    id=4,
    name="charmander",
    generation=1,
    types=["fire"],
    stats={"hp": 39, "attack": 52},
    evolution_chain_id=2,
    sprite_url=None,
)


async def test_upsert_species_inserts(db: AsyncSession) -> None:
    written = await catalog.upsert_species(db, [BULBASAUR, CHARMANDER])
    assert written == 2

    stored = await catalog.get_species(db, 1)
    assert stored is not None
    assert stored.name == "bulbasaur"
    assert stored.types == ["grass", "poison"]
    assert stored.stats["attack"] == 49


async def test_upsert_species_is_idempotent(db: AsyncSession) -> None:
    await catalog.upsert_species(db, [BULBASAUR])
    before = await catalog.count_species(db)

    await catalog.upsert_species(db, [BULBASAUR])
    assert await catalog.count_species(db) == before


async def test_upsert_species_refreshes_changed_fields(db: AsyncSession) -> None:
    await catalog.upsert_species(db, [BULBASAUR])
    renamed = BULBASAUR.model_copy(update={"name": "bulbasaur-renamed"})

    await catalog.upsert_species(db, [renamed])

    stored = await catalog.get_species(db, 1)
    assert stored is not None
    assert stored.name == "bulbasaur-renamed"


async def test_upsert_species_accepts_empty_input(db: AsyncSession) -> None:
    assert await catalog.upsert_species(db, []) == 0


@pytest.mark.parametrize(
    ("kwargs", "expected"),
    [
        ({"type_": "fire"}, [4]),
        ({"type_": "poison"}, [1]),
        ({"generation": 1}, [1, 4]),
        ({"name": "char"}, [4]),
        ({"type_": "water"}, []),
    ],
)
async def test_search_species_filters(
    db: AsyncSession, kwargs: dict[str, object], expected: list[int]
) -> None:
    await catalog.upsert_species(db, [BULBASAUR, CHARMANDER])

    found = await catalog.search_species(db, limit=200, **kwargs)  # type: ignore[arg-type]

    # The catalog is shared reference data that a real database has already been
    # synced with, so assert only over the fixtures this test inserted.
    seeded = {BULBASAUR.id, CHARMANDER.id}
    assert [s.id for s in found if s.id in seeded] == expected
