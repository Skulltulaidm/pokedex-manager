from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from pokedex.db.models import Card, CollectionItem, Species
from pokedex.schemas.collection import (
    AddCardRequest,
    CollectionFilters,
    UpdateItemRequest,
)


class CardNotFoundError(LookupError):
    """The requested card is absent from the catalog."""


def _owned(user_id: str) -> Select[tuple[CollectionItem]]:
    """Base query. Every read starts scoped to its owner."""
    return select(CollectionItem).where(CollectionItem.user_id == user_id)


def _apply_filters(
    statement: Select[tuple[CollectionItem]], filters: CollectionFilters
) -> Select[tuple[CollectionItem]]:
    if filters.type or filters.generation is not None:
        statement = statement.join(Card).join(Species)
        if filters.type:
            statement = statement.where(Species.types.contains([filters.type.lower()]))
        if filters.generation is not None:
            statement = statement.where(Species.generation == filters.generation)
    elif filters.set_id or filters.search:
        statement = statement.join(Card)

    if filters.set_id:
        statement = statement.where(Card.set_id == filters.set_id)
    if filters.search:
        statement = statement.where(Card.name_normalized.ilike(f"%{filters.search.lower()}%"))
    if filters.condition:
        statement = statement.where(CollectionItem.condition == filters.condition)

    return statement


async def add_card(
    db: AsyncSession, user_id: str, request: AddCardRequest
) -> CollectionItem:
    """Add copies to the collection, merging into an existing homogeneous group.

    Cataloguing a duplicate is not an error: the matching group's quantity grows.
    """
    if await db.get(Card, request.card_id) is None:
        raise CardNotFoundError(request.card_id)

    values = request.model_dump() | {"user_id": user_id}
    insertion = insert(CollectionItem).values(values)
    statement = insertion.on_conflict_do_update(
        constraint="uq_collection_item_group",
        set_={
            "quantity": CollectionItem.quantity + insertion.excluded.quantity,
            "notes": func.coalesce(insertion.excluded.notes, CollectionItem.notes),
            "updated_at": func.now(),
        },
    ).returning(CollectionItem)

    result = await db.execute(statement)
    await db.flush()
    item: CollectionItem = result.scalar_one()
    return item


async def list_items(
    db: AsyncSession, user_id: str, filters: CollectionFilters
) -> Sequence[CollectionItem]:
    statement = _apply_filters(_owned(user_id), filters)
    statement = (
        statement.options(
            joinedload(CollectionItem.card).joinedload(Card.species),
            joinedload(CollectionItem.card).joinedload(Card.card_set),
        )
        # `now()` is the transaction timestamp, so rows written in one
        # transaction tie; the id keeps the ordering deterministic.
        .order_by(CollectionItem.created_at.desc(), CollectionItem.id.desc())
        .limit(filters.limit)
        .offset(filters.offset)
    )

    result = await db.execute(statement)
    return result.unique().scalars().all()


async def count_items(db: AsyncSession, user_id: str, filters: CollectionFilters) -> int:
    statement = _apply_filters(_owned(user_id), filters).with_only_columns(
        func.count(CollectionItem.id)
    )
    result = await db.execute(statement)
    return result.scalar_one()


async def total_quantity(db: AsyncSession, user_id: str) -> int:
    statement = select(func.coalesce(func.sum(CollectionItem.quantity), 0)).where(
        CollectionItem.user_id == user_id
    )
    result = await db.execute(statement)
    return result.scalar_one()


async def get_item(
    db: AsyncSession, user_id: str, item_id: UUID
) -> CollectionItem | None:
    statement = (
        _owned(user_id)
        .where(CollectionItem.id == item_id)
        .options(
            joinedload(CollectionItem.card).joinedload(Card.species),
            joinedload(CollectionItem.card).joinedload(Card.card_set),
        )
    )
    result = await db.execute(statement)
    return result.unique().scalar_one_or_none()


async def update_item(
    db: AsyncSession, user_id: str, item_id: UUID, request: UpdateItemRequest
) -> CollectionItem | None:
    item = await get_item(db, user_id, item_id)
    if item is None:
        return None

    for field, value in request.model_dump(exclude_unset=True).items():
        setattr(item, field, value)

    await db.flush()
    return item


async def remove_item(db: AsyncSession, user_id: str, item_id: UUID) -> bool:
    item = await get_item(db, user_id, item_id)
    if item is None:
        return False

    await db.delete(item)
    await db.flush()
    return True
