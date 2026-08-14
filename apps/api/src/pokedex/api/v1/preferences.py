from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.api.route import CommittingRoute
from pokedex.services import preferences

router = APIRouter(tags=["preferences"], route_class=CommittingRoute)


class PreferenceView(BaseModel):
    """One durable fact the assistant learned, as its owner can read it.

    Exposed so the user can see what is being remembered about them and delete
    any of it: the agent writes here without being asked, and a memory nobody
    can inspect is one nobody agreed to.
    """

    model_config = ConfigDict(from_attributes=True)

    key: str
    value: dict[str, Any]


@router.get("/preferences", response_model=list[PreferenceView])
async def list_preferences(user: CurrentUser, db: DbSession) -> Any:
    return await preferences.list_all(db, user.id)


@router.delete("/preferences/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def forget_preference(key: str, user: CurrentUser, db: DbSession) -> None:
    if not await preferences.forget(db, user.id, key):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Preference not found")
