import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.api.route import CommittingRoute
from pokedex.schemas.catalog import (
    CardView,
    EvolutionMemberView,
    SpeciesView,
    TriviaView,
)
from pokedex.schemas.common import Page
from pokedex.schemas.market import (
    CardMarketContext,
    MarketCardView,
    MarketFilters,
    MarketSummary,
    PortfolioConcentration,
    PositionFilters,
    PositionView,
    SetMarketView,
    TradeSimulation,
    TradeSimulationRequest,
)
from pokedex.services import catalog, collection, market, trivia

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/catalog", tags=["catalog"], route_class=CommittingRoute)


@router.get("/cards", response_model=list[CardView])
async def search_cards(
    user: CurrentUser,
    db: DbSession,
    q: str | None = None,
    set_id: str | None = None,
    species_id: int | None = None,
    limit: int = Query(default=30, ge=1, le=100),
) -> list[CardView]:
    found = await catalog.search_cards(
        db, query=q, set_id=set_id, species_id=species_id, limit=limit
    )
    return [CardView.model_validate(card) for card in found]


@router.get("/market", response_model=Page[MarketCardView])
async def market_cards(
    user: CurrentUser,
    db: DbSession,
    filters: Annotated[MarketFilters, Depends()],
) -> Page[MarketCardView]:
    """The whole catalog, each card marked with how many copies the reader holds."""
    rows = await market.list_cards(db, user.id, filters)
    total = await market.count_cards(db, user.id, filters)

    return Page(
        items=[
            MarketCardView(
                card=CardView.model_validate(card), owned=owned, item_id=item_id
            )
            for card, owned, item_id in rows
        ],
        total=total,
        limit=filters.limit,
        offset=filters.offset,
    )


@router.get("/market/summary", response_model=MarketSummary)
async def market_summary(user: CurrentUser, db: DbSession) -> MarketSummary:
    return await market.summary(db, user.id)


@router.get("/market/positions", response_model=Page[PositionView])
async def market_positions(
    user: CurrentUser,
    db: DbSession,
    filters: Annotated[PositionFilters, Depends()],
) -> Page[PositionView]:
    """Every held card as a position: cost, value, gain and weight in the portfolio."""
    return Page(
        items=await market.list_positions(db, user.id, filters),
        total=await market.count_positions(db, user.id),
        limit=filters.limit,
        offset=filters.offset,
    )


@router.get("/market/concentration", response_model=PortfolioConcentration)
async def market_concentration(user: CurrentUser, db: DbSession) -> PortfolioConcentration:
    """How few cards carry the value of the portfolio."""
    return await market.concentration(db, user.id)


@router.post("/market/simulate", response_model=TradeSimulation)
async def simulate_trade(
    request: TradeSimulationRequest, user: CurrentUser, db: DbSession
) -> TradeSimulation:
    """What a swap would do to the portfolio. Reads only; nothing is traded."""
    try:
        return await market.simulate_trade(db, user.id, request)
    except market.UnknownCardError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown card: {exc}") from exc
    except market.InsufficientCopiesError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


@router.get("/market/sets", response_model=list[SetMarketView])
async def market_sets(user: CurrentUser, db: DbSession) -> list[SetMarketView]:
    """Each set as a position, costliest to finish first."""
    return await market.set_breakdown(db, user.id)


@router.get("/species/{species_id}/trivia", response_model=TriviaView | None)
async def species_trivia(species_id: int, user: CurrentUser, db: DbSession) -> Any:
    """A blurb about the species, generated once and shared by every reader."""
    species = await catalog.get_species(db, species_id)
    if species is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Species not found")

    return await trivia.get_or_create(db, species)


@router.get("/species/{species_id}/evolutions", response_model=list[EvolutionMemberView])
async def species_evolutions(
    species_id: int, user: CurrentUser, db: DbSession
) -> list[EvolutionMemberView]:
    """The evolution family this species belongs to, in dex order.

    Empty for a species with no family, so the caller renders nothing rather
    than a panel that only says a Pokemon evolves into no one.
    """
    family = await catalog.evolution_family(db, species_id, user.id)
    return [
        EvolutionMemberView(
            id=member.id,
            name=member.name,
            types=member.types,
            sprite_url=member.sprite_url,
            owned=owned,
            is_current=member.id == species_id,
        )
        for member, owned in family
    ]


@router.get("/owned-ids", response_model=list[str])
async def owned_card_ids(user: CurrentUser, db: DbSession) -> list[str]:
    """Which catalog cards the user holds, so a card list can mark them."""
    return await collection.owned_card_ids(db, user.id)


@router.get("/cards/{card_id}/context", response_model=CardMarketContext)
async def card_market_context(
    card_id: str, user: CurrentUser, db: DbSession
) -> CardMarketContext:
    card = await catalog.get_card(db, card_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    return await market.card_context(db, user.id, card)


@router.get("/cards/{card_id}", response_model=CardView)
async def get_card(card_id: str, user: CurrentUser, db: DbSession) -> CardView:
    card = await catalog.get_card(db, card_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    return CardView.model_validate(card)


@router.get("/species", response_model=list[SpeciesView])
async def search_species(
    user: CurrentUser,
    db: DbSession,
    name: str | None = None,
    type: str | None = None,
    generation: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[SpeciesView]:
    found = await catalog.search_species(
        db, name=name, type_=type, generation=generation, limit=limit
    )
    return [SpeciesView.model_validate(species) for species in found]
