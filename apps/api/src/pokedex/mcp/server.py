from typing import Any

from mcp.server import MCPServer
from mcp.server.auth.settings import AuthSettings

from pokedex.config import get_settings
from pokedex.db import SessionFactory
from pokedex.mcp.auth import JwksTokenVerifier, current_user_id
from pokedex.schemas.catalog import CardView, CollectionItemView
from pokedex.schemas.collection import CollectionFilters
from pokedex.services import catalog, collection, stats

INSTRUCTIONS = """\
Tools over a personal Pokemon card collection.

The collection is the user's own physical cards. The catalog is the published
card database, which is far larger — a card being in the catalog says nothing
about whether the user owns it. Answer in Spanish.
"""

settings = get_settings()

server = MCPServer(
    name="pokedex",
    version="0.1.0",
    instructions=INSTRUCTIONS,
    token_verifier=JwksTokenVerifier(),
    auth=AuthSettings(
        issuer_url=settings.auth_issuer,  # type: ignore[arg-type]
        resource_server_url=settings.mcp_resource_url,  # type: ignore[arg-type]
    ),
)


@server.tool()
async def search_cards(
    query: str | None = None, set_id: str | None = None, limit: int = 20
) -> dict[str, Any]:
    """Search the published card catalog by name. Not the user's collection."""
    async with SessionFactory() as db:
        found = await catalog.search_cards(db, query=query, set_id=set_id, limit=limit)
        cards = [CardView.model_validate(card).model_dump(mode="json") for card in found]
    return {"count": len(cards), "cards": cards}


@server.tool()
async def get_card_details(card_id: str) -> dict[str, Any] | None:
    """One card with both layers: the printed card and the species it depicts."""
    async with SessionFactory() as db:
        card = await catalog.get_card(db, card_id)
        if card is None:
            return None
        return CardView.model_validate(card).model_dump(mode="json")


@server.tool()
async def get_collection(
    type: str | None = None,
    generation: int | None = None,
    set_id: str | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    """List the cards the user actually owns, with optional filters."""
    user_id = current_user_id()
    filters = CollectionFilters(
        type=type, generation=generation, set_id=set_id, limit=limit
    )

    async with SessionFactory() as db:
        found = await collection.list_items(db, user_id, filters)
        items = [
            CollectionItemView.model_validate(item).model_dump(mode="json")
            for item in found
        ]
    return {"count": len(items), "items": items}


@server.tool()
async def collection_stats() -> dict[str, Any]:
    """Totals, type and generation distribution, and per-set coverage.

    Prefer this over listing the whole collection when the question is about
    shape or gaps rather than individual cards.
    """
    user_id = current_user_id()
    async with SessionFactory() as db:
        result = await stats.collection_stats(db, user_id)
        return result.model_dump(mode="json")
