from fastapi import APIRouter, Query, status

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.api.route import CommittingRoute
from pokedex.schemas.news import NewsFeed
from pokedex.services import news

router = APIRouter(prefix="/news", tags=["news"], route_class=CommittingRoute)


@router.get("", response_model=NewsFeed)
async def news_feed(
    user: CurrentUser,
    db: DbSession,
    actionable: bool = Query(default=False),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
) -> NewsFeed:
    return await news.feed(db, user.id, limit, offset, actionable)


@router.post("/seen", status_code=status.HTTP_204_NO_CONTENT)
async def mark_news_seen(user: CurrentUser, db: DbSession) -> None:
    await news.mark_seen(db, user.id)
