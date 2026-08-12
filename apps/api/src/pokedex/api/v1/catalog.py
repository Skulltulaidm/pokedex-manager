from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.schemas.catalog import CardView, SpeciesView, TriviaView
from pokedex.services import catalog, collection, trivia

router = APIRouter(prefix="/catalog", tags=["catalog"])


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


@router.get("/species/{species_id}/trivia", response_model=TriviaView | None)
async def species_trivia(species_id: int, user: CurrentUser, db: DbSession) -> Any:
    """A blurb about the species, generated once and shared by every reader."""
    species = await catalog.get_species(db, species_id)
    if species is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Species not found")

    return await trivia.get_or_create(db, species)


@router.get("/owned-ids", response_model=list[str])
async def owned_card_ids(user: CurrentUser, db: DbSession) -> list[str]:
    """Which catalog cards the user holds, so a card list can mark them."""
    return await collection.owned_card_ids(db, user.id)


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
