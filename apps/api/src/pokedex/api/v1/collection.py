from datetime import date
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, StreamingResponse

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.schemas.activity import ActivityEntry
from pokedex.schemas.catalog import CollectionItemView
from pokedex.schemas.collection import (
    AddCardRequest,
    CollectionFilters,
    UpdateItemRequest,
)
from pokedex.schemas.common import Page
from pokedex.services import activity, collection, export

router = APIRouter(prefix="/collection", tags=["collection"])


def _attachment(filename: str) -> dict[str, str]:
    return {"Content-Disposition": f'attachment; filename="{filename}"'}

# Requesting another user's item answers 404 rather than 403: a 403 would
# confirm the row exists.
NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, "Collection item not found")


@router.get("", response_model=Page[CollectionItemView])
async def list_collection(
    user: CurrentUser,
    db: DbSession,
    filters: Annotated[CollectionFilters, Depends()],
) -> Page[CollectionItemView]:
    items = await collection.list_items(db, user.id, filters)
    total = await collection.count_items(db, user.id, filters)

    return Page(
        items=[CollectionItemView.model_validate(item) for item in items],
        total=total,
        limit=filters.limit,
        offset=filters.offset,
    )


@router.get("/activity", response_model=list[ActivityEntry])
async def collection_activity(user: CurrentUser, db: DbSession) -> Any:
    """Recent additions, scans and suggestions, newest first."""
    return await activity.recent(db, user.id)


@router.get("/export")
async def export_collection(
    user: CurrentUser, db: DbSession, format: Literal["csv", "json"] = "csv"
) -> Response:
    """The whole collection as a file, unpaginated: an export that stops at 200
    rows is not an export."""
    items = await collection.all_items(db, user.id)
    stamp = date.today().isoformat()

    if format == "json":
        return JSONResponse(
            jsonable_encoder(export.to_rows(items)),
            headers=_attachment(f"pokedex-{stamp}.json"),
        )

    return StreamingResponse(
        export.to_csv(items),
        media_type="text/csv; charset=utf-8",
        headers=_attachment(f"pokedex-{stamp}.csv"),
    )


@router.post("", response_model=CollectionItemView, status_code=status.HTTP_201_CREATED)
async def add_card(
    request: AddCardRequest, user: CurrentUser, db: DbSession
) -> CollectionItemView:
    try:
        item = await collection.add_card(db, user.id, request)
    except collection.CardNotFoundError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown card: {request.card_id}"
        ) from exc

    stored = await collection.get_item(db, user.id, item.id)
    if stored is None:
        raise NOT_FOUND
    return CollectionItemView.model_validate(stored)


@router.get("/{item_id}", response_model=CollectionItemView)
async def get_item(item_id: UUID, user: CurrentUser, db: DbSession) -> CollectionItemView:
    item = await collection.get_item(db, user.id, item_id)
    if item is None:
        raise NOT_FOUND
    return CollectionItemView.model_validate(item)


@router.patch("/{item_id}", response_model=CollectionItemView)
async def update_item(
    item_id: UUID, request: UpdateItemRequest, user: CurrentUser, db: DbSession
) -> CollectionItemView:
    item = await collection.update_item(db, user.id, item_id, request)
    if item is None:
        raise NOT_FOUND
    return CollectionItemView.model_validate(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_item(item_id: UUID, user: CurrentUser, db: DbSession) -> None:
    if not await collection.remove_item(db, user.id, item_id):
        raise NOT_FOUND
