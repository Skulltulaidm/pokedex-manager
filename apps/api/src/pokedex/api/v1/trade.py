from typing import Any

from fastapi import APIRouter

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.schemas.trade import TradeMatch
from pokedex.services import trade

router = APIRouter(tags=["trades"])


@router.get("/trades", response_model=list[TradeMatch])
async def list_trades(user: CurrentUser, db: DbSession, limit: int = 10) -> Any:
    """Collectors who want a spare card and hold a wanted one.

    A match is a possibility, not an agreement: nothing here moves a card. The
    cards named are only the two-way overlap, so what else a counterparty owns
    stays theirs.
    """
    return await trade.find_matches(db, user.id, limit=limit)
