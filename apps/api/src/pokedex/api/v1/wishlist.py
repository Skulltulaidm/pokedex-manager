from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.db.models import WishlistSource
from pokedex.schemas.gaps import AddWishlistRequest, SetGap, WishlistItemView
from pokedex.services import gaps, wishlist
from pokedex.services.collection import CardNotFoundError

router = APIRouter(tags=["wishlist"])


@router.get("/gaps", response_model=list[SetGap])
async def list_gaps(
    user: CurrentUser, db: DbSession, set_id: str | None = None, limit: int = 20
) -> Any:
    return await gaps.find_gaps(db, user.id, set_id=set_id, limit=limit)


@router.get("/wishlist", response_model=list[WishlistItemView])
async def list_wishlist(user: CurrentUser, db: DbSession) -> Any:
    return await wishlist.list_items(db, user.id)


@router.post(
    "/wishlist", response_model=WishlistItemView, status_code=status.HTTP_201_CREATED
)
async def add_to_wishlist(
    request: AddWishlistRequest, user: CurrentUser, db: DbSession
) -> Any:
    try:
        item = await wishlist.add(db, user.id, request, added_by=WishlistSource.USER)
    except CardNotFoundError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown card: {request.card_id}"
        ) from exc

    return await wishlist.get_item(db, user.id, item.id)


@router.delete("/wishlist/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_wishlist(item_id: UUID, user: CurrentUser, db: DbSession) -> None:
    if not await wishlist.remove(db, user.id, item_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Wishlist item not found")
