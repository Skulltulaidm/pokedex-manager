from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from pokedex.db.models import Card, WishlistItem, WishlistSource
from pokedex.schemas.gaps import AddWishlistRequest
from pokedex.services.collection import CardNotFoundError


async def add(
    db: AsyncSession,
    user_id: str,
    request: AddWishlistRequest,
    added_by: WishlistSource,
) -> WishlistItem:
    if await db.get(Card, request.card_id) is None:
        raise CardNotFoundError(request.card_id)

    values = request.model_dump() | {"user_id": user_id, "added_by": added_by}
    statement = (
        insert(WishlistItem)
        .values(values)
        .on_conflict_do_update(
            constraint="uq_wishlist_item_user_card",
            # A user re-adding what the agent suggested takes ownership of the
            # entry, which is what makes the suggestion's conversion measurable.
            set_={"priority": values["priority"], "reason": values["reason"], "added_by": added_by},
        )
        .returning(WishlistItem)
    )

    result = await db.execute(statement)
    await db.flush()
    item: WishlistItem = result.scalar_one()
    return item


async def list_items(db: AsyncSession, user_id: str) -> list[WishlistItem]:
    result = await db.execute(
        select(WishlistItem)
        .options(joinedload(WishlistItem.card).joinedload(Card.card_set),
                 joinedload(WishlistItem.card).joinedload(Card.species))
        .where(WishlistItem.user_id == user_id)
        .order_by(WishlistItem.priority.desc(), WishlistItem.created_at.desc())
    )
    return list(result.unique().scalars())


async def get_item(db: AsyncSession, user_id: str, item_id: UUID) -> WishlistItem | None:
    result = await db.execute(
        select(WishlistItem)
        .options(joinedload(WishlistItem.card).joinedload(Card.card_set),
                 joinedload(WishlistItem.card).joinedload(Card.species))
        .where(WishlistItem.id == item_id, WishlistItem.user_id == user_id)
    )
    return result.unique().scalar_one_or_none()


async def remove(db: AsyncSession, user_id: str, item_id: UUID) -> bool:
    item = await get_item(db, user_id, item_id)
    if item is None:
        return False
    await db.delete(item)
    return True
