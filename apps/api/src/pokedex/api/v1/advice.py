from fastapi import APIRouter, HTTPException, status

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.api.route import CommittingRoute
from pokedex.schemas.advice import TradeAdvice, TradeAdviceRequest
from pokedex.services import advice

router = APIRouter(prefix="/advice", tags=["advice"], route_class=CommittingRoute)


@router.post("/trade", response_model=TradeAdvice)
async def propose_trade(
    user: CurrentUser,
    db: DbSession,
    request: TradeAdviceRequest,
) -> TradeAdvice:
    """One swap worth simulating, drawn from what the reader has spare and wants."""
    try:
        return await advice.propose_trade(db, user.id, request.goal)
    except advice.AdviceUnavailableError:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "El asistente no está configurado.",
        ) from None
    except LookupError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Hacen falta cartas repetidas y una lista de deseos para proponer algo.",
        ) from None
