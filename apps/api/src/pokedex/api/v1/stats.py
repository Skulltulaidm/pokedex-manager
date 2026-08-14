from fastapi import APIRouter

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.api.route import CommittingRoute
from pokedex.schemas.stats import CollectionStats
from pokedex.services import stats

router = APIRouter(prefix="/stats", tags=["stats"], route_class=CommittingRoute)


@router.get("", response_model=CollectionStats)
async def collection_stats(user: CurrentUser, db: DbSession) -> CollectionStats:
    return await stats.collection_stats(db, user.id)
