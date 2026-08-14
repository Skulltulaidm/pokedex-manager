from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.api.route import CommittingRoute
from pokedex.db.models import OfferStatus
from pokedex.schemas.common import Page
from pokedex.schemas.trade import (
    CollectorProfile,
    CollectorView,
    CreateOfferRequest,
    RespondOfferRequest,
    SpareCard,
    TradeMatch,
    TradeOfferView,
)
from pokedex.services import trade
from pokedex.services.trade import OfferError

router = APIRouter(tags=["trades"], route_class=CommittingRoute)


@router.get("/trades", response_model=Page[TradeMatch])
async def list_trades(
    user: CurrentUser,
    db: DbSession,
    search: str | None = None,
    favourable: bool | None = None,
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
) -> Any:
    """Collectors who want a spare card and hold a wanted one.

    A match is a possibility, not an agreement: nothing here moves a card. The
    cards named are only the two-way overlap, so what else a counterparty owns
    stays theirs.
    """
    return await trade.match_page(
        db, user.id, search=search, favourable=favourable, limit=limit, offset=offset
    )


@router.get("/trades/collectors", response_model=Page[CollectorView])
async def list_collectors(
    user: CurrentUser,
    db: DbSession,
    search: str | None = None,
    limit: int = Query(default=12, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
) -> Any:
    """Collectors with cards free to trade, and how they line up with the reader.

    A collector appears whether or not a swap already works out. What is shown
    about them is only what could move: how much is spare, and how much of it
    either side wants.
    """
    return await trade.collector_page(db, user.id, search=search, limit=limit, offset=offset)


@router.get("/trades/collectors/{owner_id}", response_model=CollectorProfile)
async def get_collector(owner_id: str, user: CurrentUser, db: DbSession) -> Any:
    """One collector's public profile.

    Counts, never money: what a collection is worth stays with whoever owns it.
    Reading your own id returns the same shape with `is_self` set.
    """
    profile = await trade.collector_profile(db, owner_id, viewer_id=user.id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collector not found")

    return profile


@router.get("/trades/collectors/{owner_id}/spares", response_model=Page[SpareCard])
async def list_spares(
    owner_id: str,
    user: CurrentUser,
    db: DbSession,
    search: str | None = None,
    wanted_only: bool = False,
    limit: int = Query(default=24, ge=1, le=60),
    offset: int = Query(default=0, ge=0),
) -> Any:
    """One collector's spare cards, with the reader's wants marked.

    Pass the reader's own id to browse what they have free to offer.
    """
    return await trade.spare_page(
        db,
        owner_id,
        viewer_id=user.id,
        search=search,
        wanted_only=wanted_only,
        limit=limit,
        offset=offset,
    )


@router.get("/trades/offers", response_model=Page[TradeOfferView])
async def list_offers(
    user: CurrentUser,
    db: DbSession,
    status_filter: OfferStatus | None = None,
    direction: Literal["sent", "received"] | None = None,
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
) -> Any:
    """Offers the reader is party to, sent and received, newest first."""
    return await trade.offer_page(
        db, user.id, status=status_filter, direction=direction, limit=limit, offset=offset
    )


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


@router.post(
    "/trades/offers/{offer_id}/counter",
    response_model=TradeOfferView,
    status_code=status.HTTP_201_CREATED,
)
async def counter_offer(
    offer_id: UUID, request: CreateOfferRequest, user: CurrentUser, db: DbSession
) -> Any:
    """Answer an offer with a different one, declining the original.

    Only its recipient may, and the counter goes back to whoever sent it.
    """
    try:
        countered = await trade.counter_offer(db, user.id, offer_id, request)
    except OfferError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    if countered is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Offer not found")

    return await _view(db, user.id, countered.id)


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
