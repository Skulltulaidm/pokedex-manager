from fastapi import APIRouter
from pydantic import BaseModel

from pokedex.api.deps import CurrentUser

router = APIRouter(tags=["probe"])


class MeResponse(BaseModel):
    id: str
    email: str | None


@router.get("/me", response_model=MeResponse)
async def me(user: CurrentUser) -> MeResponse:
    return MeResponse(id=user.id, email=user.email)
