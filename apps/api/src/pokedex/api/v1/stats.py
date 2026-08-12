from fastapi import APIRouter

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.schemas.stats import CollectionStats
from pokedex.services import stats

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("", response_model=CollectionStats)
async def collection_stats(user: CurrentUser, db: DbSession) -> CollectionStats:
    return await stats.collection_stats(db, user.id)
