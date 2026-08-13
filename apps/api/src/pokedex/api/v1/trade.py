from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.db.models import OfferStatus
from pokedex.schemas.trade import (
    CreateOfferRequest,
    RespondOfferRequest,
    TradeMatch,
    TradeOfferView,
)
from pokedex.services import trade
from pokedex.services.trade import OfferError

router = APIRouter(tags=["trades"])


@router.get("/trades", response_model=list[TradeMatch])
async def list_trades(user: CurrentUser, db: DbSession, limit: int = 10) -> Any:
    """Collectors who want a spare card and hold a wanted one.

    A match is a possibility, not an agreement: nothing here moves a card. The
    cards named are only the two-way overlap, so what else a counterparty owns
    stays theirs.
    """
    return await trade.find_matches(db, user.id, limit=limit)


@router.get("/trades/offers", response_model=list[TradeOfferView])
async def list_offers(
    user: CurrentUser, db: DbSession, status_filter: OfferStatus | None = None
) -> Any:
    """Offers the reader is party to, sent and received, newest first."""
    return await trade.list_offers(db, user.id, status=status_filter)


@router.post(
    "/trades/offers", response_model=TradeOfferView, status_code=status.HTTP_201_CREATED
)
async def create_offer(
    request: CreateOfferRequest, user: CurrentUser, db: DbSession
) -> Any:
    """Propose a swap. Both sides must be cards their owner holds more than once."""
    try:
        offer = await trade.create_offer(db, user.id, request)
    except OfferError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc

    return await _view(db, user.id, offer.id)


@router.post("/trades/offers/{offer_id}/respond", response_model=TradeOfferView)
async def respond_to_offer(
    offer_id: UUID, request: RespondOfferRequest, user: CurrentUser, db: DbSession
) -> Any:
    """Accept or decline an offer. Only its recipient may, and only once."""
    try:
        offer = await trade.respond_to_offer(db, user.id, offer_id, request.accept)
    except OfferError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    if offer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Offer not found")

    return await _view(db, user.id, offer.id)


@router.post("/trades/offers/{offer_id}/withdraw", response_model=TradeOfferView)
async def withdraw_offer(offer_id: UUID, user: CurrentUser, db: DbSession) -> Any:
    """Pull back an offer. Only its author, and only while it is unanswered."""
    try:
        offer = await trade.withdraw_offer(db, user.id, offer_id)
    except OfferError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    if offer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Offer not found")

    return await _view(db, user.id, offer.id)


async def _view(db: DbSession, user_id: str, offer_id: UUID) -> TradeOfferView:
    """Re-read through the list so one shape describes an offer everywhere."""
    offers = await trade.list_offers(db, user_id)
    return next(offer for offer in offers if offer.id == offer_id)
