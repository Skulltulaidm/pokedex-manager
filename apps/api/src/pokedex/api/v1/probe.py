from fastapi import APIRouter
from pydantic import BaseModel

from pokedex.api.deps import CurrentUser
from pokedex.api.route import CommittingRoute

router = APIRouter(tags=["probe"], route_class=CommittingRoute)


class MeResponse(BaseModel):
    id: str
    email: str | None


@router.get("/me", response_model=MeResponse)
async def me(user: CurrentUser) -> MeResponse:
    return MeResponse(id=user.id, email=user.email)
