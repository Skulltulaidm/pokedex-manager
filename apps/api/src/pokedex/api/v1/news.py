from fastapi import APIRouter, Query

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.api.route import CommittingRoute
from pokedex.schemas.news import NewsFeed
from pokedex.services import news

router = APIRouter(prefix="/news", tags=["news"], route_class=CommittingRoute)


@router.get("", response_model=NewsFeed)
async def news_feed(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=20, ge=1, le=50),
) -> NewsFeed:
    return await news.feed(db, user.id, limit)
