from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from pokedex.db.models import Card, CardSet, Species
from pokedex.integrations.pokeapi import SpeciesPayload
from pokedex.integrations.tcgdex import CardPayload, SetPayload


async def upsert_species(db: AsyncSession, payloads: Sequence[SpeciesPayload]) -> int:
    """Insert or refresh species rows. Idempotent: re-syncing never duplicates."""
    if not payloads:
        return 0

    rows = [payload.model_dump() for payload in payloads]
    statement = insert(Species).values(rows)
    statement = statement.on_conflict_do_update(
        index_elements=[Species.id],
        set_={
            "name": statement.excluded.name,
            "generation": statement.excluded.generation,
            "types": statement.excluded.types,
            "stats": statement.excluded.stats,
            "evolution_chain_id": statement.excluded.evolution_chain_id,
            "sprite_url": statement.excluded.sprite_url,
            "fetched_at": func.now(),
        },
    )

    await db.execute(statement)
    return len(rows)


async def upsert_sets(db: AsyncSession, payloads: Sequence[SetPayload]) -> int:
    if not payloads:
        return 0

    rows = [payload.model_dump(exclude={"card_ids"}) for payload in payloads]
    statement = insert(CardSet).values(rows)
    statement = statement.on_conflict_do_update(
        index_elements=[CardSet.id],
        set_={
            column: statement.excluded[column]
            for column in ("name", "series", "printed_total", "total", "release_date")
        }
        | {
            "logo_url": statement.excluded.logo_url,
            "symbol_url": statement.excluded.symbol_url,
            "fetched_at": func.now(),
        },
    )

    await db.execute(statement)
    return len(rows)


async def upsert_cards(db: AsyncSession, payloads: Sequence[CardPayload]) -> int:
    if not payloads:
        return 0

    rows = [payload.model_dump() for payload in payloads]
    statement = insert(Card).values(rows)
    statement = statement.on_conflict_do_update(
        index_elements=[Card.id],
        set_={
            column: statement.excluded[column]
            for column in (
                "set_id",
                "species_id",
                "category",
                "number",
                "number_prefix",
                "name",
                "name_normalized",
                "rarity",
                "variants",
                "hp",
                "image_small_url",
                "image_large_url",
                "price_usd",
                "price_updated_at",
            )
        }
        | {"fetched_at": func.now()},
    )

    await db.execute(statement)
    return len(rows)


async def get_species(db: AsyncSession, dex_id: int) -> Species | None:
    return await db.get(Species, dex_id)


async def search_cards(
    db: AsyncSession,
    *,
    query: str | None = None,
    set_id: str | None = None,
    limit: int = 30,
) -> Sequence[Card]:
    statement = (
        select(Card)
        .options(joinedload(Card.card_set), joinedload(Card.species))
        .order_by(Card.set_id, Card.number_prefix)
        .limit(limit)
    )

    if query:
        statement = statement.where(Card.name_normalized.ilike(f"%{query.lower()}%"))
    if set_id:
        statement = statement.where(Card.set_id == set_id)

    result = await db.execute(statement)
    return result.unique().scalars().all()


async def get_card(db: AsyncSession, card_id: str) -> Card | None:
    """Card with both layers joined: the printed card and the species it depicts."""
    statement = (
        select(Card)
        .where(Card.id == card_id)
        .options(joinedload(Card.card_set), joinedload(Card.species))
    )
    result = await db.execute(statement)
    return result.scalar_one_or_none()


async def count_species(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(Species))
    return result.scalar_one()


async def search_species(
    db: AsyncSession,
    *,
    name: str | None = None,
    type_: str | None = None,
    generation: int | None = None,
    limit: int = 50,
) -> Sequence[Species]:
    statement = select(Species).order_by(Species.id).limit(limit)

    if name:
        statement = statement.where(Species.name.ilike(f"%{name.lower()}%"))
    if type_:
        # `@>` rather than `= ANY(...)`: the containment operator is what the
        # GIN index on `types` can actually serve.
        statement = statement.where(Species.types.contains([type_.lower()]))
    if generation is not None:
        statement = statement.where(Species.generation == generation)

    result = await db.execute(statement)
    return result.scalars().all()
