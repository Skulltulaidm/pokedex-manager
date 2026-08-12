from typing import Any

from mcp.server import MCPServer
from mcp.server.auth.settings import AuthSettings

from pokedex.config import get_settings
from pokedex.db import SessionFactory
from pokedex.db.models import WishlistSource
from pokedex.mcp.auth import JwksTokenVerifier, current_user_id
from pokedex.schemas.catalog import CardView, CollectionItemView
from pokedex.schemas.collection import CollectionFilters
from pokedex.schemas.gaps import AddWishlistRequest, WishlistItemView
from pokedex.services import catalog, collection, gaps, stats, wishlist
from pokedex.services.collection import CardNotFoundError

INSTRUCTIONS = """\
Tools over a personal Pokemon card collection.

The collection is the user's own physical cards. The catalog is the published
card database, which is far larger — a card being in the catalog says nothing
about whether the user owns it.

You cannot add cards to the collection: only the user handling a real card can
do that. You can suggest a card for their wishlist with suggest_card, and you
must say what you are suggesting and why before you call it.

Answer in Spanish.
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


@server.tool()
async def find_gaps(set_id: str | None = None, limit: int = 20) -> dict[str, Any]:
    """Cards the user is missing from sets they have already started.

    Scoped to started sets: every card ever printed is missing from a collection,
    which is true and useless.
    """
    user_id = current_user_id()
    async with SessionFactory() as db:
        found = await gaps.find_gaps(db, user_id, set_id=set_id, limit=limit)
        remaining = await gaps.set_totals(db, user_id)

    return {
        "remaining_by_set": remaining,
        "sets": [gap.model_dump(mode="json") for gap in found],
    }


@server.tool()
async def get_wishlist() -> dict[str, Any]:
    """Cards the user wants, including the ones this assistant suggested."""
    user_id = current_user_id()
    async with SessionFactory() as db:
        items = await wishlist.list_items(db, user_id)
        views = [WishlistItemView.model_validate(item).model_dump(mode="json") for item in items]
    return {"count": len(views), "items": views}


@server.tool()
async def suggest_card(card_id: str, reason: str) -> dict[str, Any]:
    """Add a card to the user's wishlist as a suggestion from this assistant.

    This is the only write available here, and it deliberately cannot touch the
    collection: that records which cards the user physically owns, and nothing
    but the user handling a card should change it. A suggestion is a proposal the
    user can act on or delete.
    """
    user_id = current_user_id()
    async with SessionFactory() as db:
        try:
            item = await wishlist.add(
                db,
                user_id,
                AddWishlistRequest(card_id=card_id, reason=reason),
                added_by=WishlistSource.AGENT,
            )
        except CardNotFoundError:
            return {"added": False, "error": f"No card with id {card_id}"}

        view = WishlistItemView.model_validate(await wishlist.get_item(db, user_id, item.id))
        await db.commit()

    return {"added": True, "item": view.model_dump(mode="json")}
