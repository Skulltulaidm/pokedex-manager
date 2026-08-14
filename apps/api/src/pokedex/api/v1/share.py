from typing import Any

from fastapi import APIRouter, HTTPException, status

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.api.route import CommittingRoute
from pokedex.schemas.collection import CollectionFilters
from pokedex.schemas.share import PublicCollection, PublicItemView, ShareLinkView
from pokedex.services import collection, share, stats

router = APIRouter(tags=["share"], route_class=CommittingRoute)

MAX_PUBLIC_ITEMS = 200


@router.get("/share", response_model=ShareLinkView | None)
async def get_share_link(user: CurrentUser, db: DbSession) -> Any:
    return await share.active_link(db, user.id)


@router.post("/share", response_model=ShareLinkView, status_code=status.HTTP_201_CREATED)
async def create_share_link(user: CurrentUser, db: DbSession) -> Any:
    return await share.create(db, user.id)


@router.delete("/share", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share_link(user: CurrentUser, db: DbSession) -> None:
    if not await share.revoke(db, user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active share link")


@router.get("/public/{token}", response_model=PublicCollection)
async def read_shared_collection(token: str, db: DbSession) -> Any:
    """The only unauthenticated route in the API.

    It answers 404 for a revoked link exactly as it does for one that never
    existed, so a revoked token cannot be told apart from a wrong guess.
    """
    link = await share.resolve(db, token)
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")

    filters = CollectionFilters(limit=MAX_PUBLIC_ITEMS, offset=0)
    items = await collection.list_items(db, link.user_id, filters)
    summary = await stats.collection_stats(db, link.user_id)

    return PublicCollection(
        total_cards=summary.total_cards,
        total_groups=summary.total_groups,
        types=summary.types,
        sets=summary.sets,
        items=[PublicItemView.model_validate(item) for item in items],
    )
