from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import Card, CardSet, CollectionItem, Species
from pokedex.schemas.stats import (
    CollectionStats,
    GenerationCount,
    OwnedSlot,
    SetCoverage,
    TypeCount,
)


def _owned_cards(user_id: str):  # type: ignore[no-untyped-def]
    return (
        select(CollectionItem.card_id, CollectionItem.quantity)
        .where(CollectionItem.user_id == user_id)
        .subquery()
    )


async def _types(db: AsyncSession, user_id: str) -> list[TypeCount]:
    owned = _owned_cards(user_id)
    # unnest lives in a subquery so the outer GROUP BY has a plain column to
    # reference rather than a set-returning function.
    exploded = (
        select(func.unnest(Species.types).label("type"))
        .select_from(owned)
        .join(Card, Card.id == owned.c.card_id)
        .join(Species, Species.id == Card.species_id)
        .subquery()
    )

    result = await db.execute(
        select(exploded.c.type, func.count().label("total"))
        .group_by(exploded.c.type)
        .order_by(func.count().desc(), exploded.c.type)
    )
    return [TypeCount(type=row.type, count=row.total) for row in result]


async def _generations(db: AsyncSession, user_id: str) -> list[GenerationCount]:
    owned = _owned_cards(user_id)
    result = await db.execute(
        select(Species.generation, func.count().label("total"))
        .select_from(owned)
        .join(Card, Card.id == owned.c.card_id)
        .join(Species, Species.id == Card.species_id)
        .group_by(Species.generation)
        .order_by(Species.generation)
    )
    return [
        GenerationCount(generation=row.generation, count=row.total) for row in result
    ]


async def _sets(db: AsyncSession, user_id: str) -> list[SetCoverage]:
    owned = _owned_cards(user_id)
    result = await db.execute(
        select(
            CardSet.id,
            CardSet.name,
            CardSet.printed_total,
            Card.number_prefix,
            # Postgres arrays are 1-indexed; a card with no species joined yields
            # NULL, which the client renders as an untyped slot rather than a gap.
            Species.types[1].label("primary_type"),
        )
        .select_from(owned)
        .join(Card, Card.id == owned.c.card_id)
        .join(CardSet, CardSet.id == Card.set_id)
        .outerjoin(Species, Species.id == Card.species_id)
        .distinct()
        .order_by(CardSet.name, Card.number_prefix)
    )

    by_set: dict[str, SetCoverage] = {}
    for row in result:
        coverage = by_set.get(row.id)
        if coverage is None:
            coverage = SetCoverage(
                set_id=row.id,
                set_name=row.name,
                printed_total=row.printed_total,
                owned=0,
                owned_slots=[],
            )
            by_set[row.id] = coverage

        coverage.owned_slots.append(
            OwnedSlot(number=row.number_prefix, type=row.primary_type)
        )
        coverage.owned += 1

    return list(by_set.values())


async def collection_stats(db: AsyncSession, user_id: str) -> CollectionStats:
    groups = await db.execute(
        select(
            func.count(CollectionItem.id),
            func.coalesce(func.sum(CollectionItem.quantity), 0),
        ).where(CollectionItem.user_id == user_id)
    )
    total_groups, total_cards = groups.one()

    return CollectionStats(
        total_groups=total_groups,
        total_cards=total_cards,
        types=await _types(db, user_id),
        generations=await _generations(db, user_id),
        sets=await _sets(db, user_id),
    )
