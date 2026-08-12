import logging

from pydantic_ai import Agent
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.agent.models import build_model
from pokedex.config import get_settings
from pokedex.db.models import Species, SpeciesTrivia

logger = logging.getLogger(__name__)

PROMPT = """\
Write one short paragraph in Spanish about this Pokemon species for a card
collector: what it is, how it is regarded, and one detail worth knowing.

Three sentences at most. State nothing you are unsure of — no invented dates,
numbers or card names. Do not mention its stats; the reader can already see them.
"""


async def get_or_create(db: AsyncSession, species: Species) -> SpeciesTrivia | None:
    """Return the cached blurb, generating it once if it is missing.

    Returns None rather than raising when no model is configured: trivia is a
    garnish, and the card screen has to render without it.
    """
    cached = await db.get(SpeciesTrivia, species.id)
    if cached is not None:
        return cached

    settings = get_settings()
    if not settings.agent_enabled:
        return None

    agent = Agent(build_model(settings.agent_model), instructions=PROMPT)

    try:
        result = await agent.run(f"{species.name}, generation {species.generation}")
    except Exception:
        logger.exception("trivia generation failed for %s", species.name)
        return None

    trivia = SpeciesTrivia(
        species_id=species.id, text=result.output.strip(), model=settings.agent_model
    )
    db.add(trivia)
    await db.flush()
    return trivia
