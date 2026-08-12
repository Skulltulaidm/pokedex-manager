import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import SpeciesTrivia
from pokedex.integrations.pokeapi import SpeciesPayload
from pokedex.services import catalog, trivia

PIKACHU = SpeciesPayload(
    id=25,
    name="pikachu",
    generation=1,
    types=["electric"],
    stats={"hp": 35},
    evolution_chain_id=10,
    sprite_url=None,
)


@pytest.fixture
async def seeded(db: AsyncSession) -> AsyncSession:
    await catalog.upsert_species(db, [PIKACHU])
    return db


async def test_a_cached_blurb_is_returned_without_a_model(
    seeded: AsyncSession,
) -> None:
    """The cache is the point: a species reads the same for everyone, so the
    text is paid for once and never again."""
    seeded.add(SpeciesTrivia(species_id=25, text="Un ratón eléctrico.", model="test"))
    await seeded.flush()

    species = await catalog.get_species(seeded, 25)
    assert species is not None

    result = await trivia.get_or_create(seeded, species)
    assert result is not None
    assert result.text == "Un ratón eléctrico."
    assert result.model == "test"


async def test_no_model_configured_yields_nothing_rather_than_failing(
    seeded: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Trivia is a garnish; the card screen has to render without it."""
    from pokedex import config

    settings = config.get_settings()
    monkeypatch.setattr(type(settings), "agent_enabled", property(lambda _: False))

    species = await catalog.get_species(seeded, 25)
    assert species is not None

    assert await trivia.get_or_create(seeded, species) is None
