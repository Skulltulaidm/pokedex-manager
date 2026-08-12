from sqlalchemy import Select, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from sqlalchemy.sql.elements import ColumnElement

from pokedex.db.models import Card, CardSet, CollectionItem
from pokedex.schemas.catalog import CardView
from pokedex.schemas.gaps import SetGap


def _started_sets(user_id: str) -> Select[tuple[str]]:
    return (
        select(Card.set_id)
        .join(CollectionItem, CollectionItem.card_id == Card.id)
        .where(CollectionItem.user_id == user_id)
        .distinct()
    )


async def find_gaps(
    db: AsyncSession, user_id: str, set_id: str | None = None, limit: int = 20
) -> list[SetGap]:
    """Cards printed in a set the user has started but does not own.

    Scoped to started sets on purpose: every card ever printed is missing from a
    collection, which is true and useless. A set already begun is the one the
    user is actually trying to finish.
    """
    owned = (
        select(CollectionItem.card_id)
        .where(CollectionItem.user_id == user_id)
        .scalar_subquery()
    )

    started = _started_sets(user_id)
    conditions: list[ColumnElement[bool]] = [Card.set_id.in_(started), Card.id.not_in(owned)]
    if set_id:
        conditions.append(Card.set_id == set_id)

    result = await db.execute(
        select(Card)
        .options(joinedload(Card.card_set), joinedload(Card.species))
        .where(and_(*conditions))
        .order_by(Card.set_id, func.length(Card.number_prefix), Card.number_prefix)
        .limit(limit)
    )

    by_set: dict[str, SetGap] = {}
    for card in result.unique().scalars():
        gap = by_set.get(card.set_id)
        if gap is None:
            gap = SetGap(
                set_id=card.set_id,
                set_name=card.card_set.name,
                printed_total=card.card_set.printed_total,
                missing=[],
            )
            by_set[card.set_id] = gap
        gap.missing.append(CardView.model_validate(card))

    return list(by_set.values())


async def count_missing(db: AsyncSession, user_id: str) -> int:
    owned = (
        select(CollectionItem.card_id)
        .where(CollectionItem.user_id == user_id)
        .scalar_subquery()
    )
    result = await db.execute(
        select(func.count(Card.id)).where(
            Card.set_id.in_(_started_sets(user_id)), Card.id.not_in(owned)
        )
    )
    return result.scalar_one()


async def set_totals(db: AsyncSession, user_id: str) -> dict[str, int]:
    """How many cards remain per started set, without listing them."""
    owned = (
        select(CollectionItem.card_id)
        .where(CollectionItem.user_id == user_id)
        .scalar_subquery()
    )
    result = await db.execute(
        select(CardSet.name, func.count(Card.id))
        .join(Card, Card.set_id == CardSet.id)
        .where(Card.set_id.in_(_started_sets(user_id)), Card.id.not_in(owned))
        .group_by(CardSet.name)
    )
    return {name: count for name, count in result}
