from decimal import Decimal
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
from pokedex.services import (
    catalog,
    collection,
    gaps,
    market,
    preferences,
    stats,
    trade,
    wishlist,
)
from pokedex.services.collection import CardNotFoundError

INSTRUCTIONS = """\
Tools over a personal Pokemon card collection.

The collection is the user's own physical cards. The catalog is the published
card database, which is far larger — a card being in the catalog says nothing
about whether the user owns it.

You cannot add cards to the collection: only the user handling a real card can
do that. You can suggest a card for their wishlist with suggest_card, and you
must say what you are suggesting and why before you call it.

When the user states a standing fact about how they collect, store it with
remember. Anything already known about them is given to you below; you do not
need a tool to read it back.

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
async def market_summary() -> dict[str, Any]:
    """What the catalog is worth and how much of it the user holds.

    Answers questions about money rather than shape: what the collection is
    worth, what finishing it would cost, and which set is furthest from done.
    Every amount is in US dollars. Price movement is present only once the
    catalog has been synced on more than one day; a null change means unknown,
    not flat.

    `performance` compares what the holdings cost against what they are worth,
    and covers only the copies whose purchase price the user recorded —
    `positions_without_cost` is how many are missing one. It is null when no
    purchase price has been recorded at all, which is the moment to ask for one
    rather than to report a return of zero.
    """
    user_id = current_user_id()
    async with SessionFactory() as db:
        totals = await market.summary(db, user_id)
        sets = await market.set_breakdown(db, user_id)

    return {
        "currency": "USD",
        "totals": totals.model_dump(mode="json"),
        "sets": [entry.model_dump(mode="json") for entry in sets],
    }


@server.tool()
async def cheapest_missing(set_id: str | None = None, limit: int = 20) -> dict[str, Any]:
    """The least expensive cards the user does not own, cheapest first.

    This is the order a set actually gets finished in, so prefer it over
    find_gaps when the question involves cost, budget or what to buy next.
    The running total says what the listed cards cost together, in US dollars.
    Cards without a price are left out: they cannot be budgeted for.
    """
    user_id = current_user_id()
    async with SessionFactory() as db:
        found = await market.cheapest_missing(db, user_id, set_id=set_id, limit=limit)
        cards = [CardView.model_validate(card).model_dump(mode="json") for card in found]

    return {
        "currency": "USD",
        "count": len(cards),
        "running_total_usd": str(
            sum((Decimal(card["price_usd"]) for card in cards), Decimal(0))
        ),
        "cards": cards,
    }


@server.tool()
async def find_trades(limit: int = 10) -> dict[str, Any]:
    """Collectors who want a card the user has spare, and hold one the user wants.

    Both sides are always present: a match is a swap, not a wish. Only cards a
    user holds more than once are offered — the only copy of a card is their
    collection, not stock.

    `balance` is in the user's favour when positive, and it is a starting point
    rather than a verdict: a lopsided balance is worth saying out loud, and so
    is a card that both of them are short of. Values count one copy of each
    card, whatever `copies` says is available. `unpriced` cards carry no market
    price and are therefore missing from both totals — never call a swap even
    without checking that number first.

    Nothing here moves a card or contacts anybody. It says a trade is possible,
    and the two collectors arrange it themselves.
    """
    user_id = current_user_id()
    async with SessionFactory() as db:
        matches = await trade.find_matches(db, user_id, limit=limit)

    return {
        "currency": "USD",
        "count": len(matches),
        "matches": [match.model_dump(mode="json") for match in matches],
    }


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


@server.tool()
async def remember(key: str, value: str) -> dict[str, Any]:
    """Store something durable the user said about how they collect.

    For standing facts only — what they collect, what they avoid, what they are
    working towards — never for the subject of the current question.
    """
    user_id = current_user_id()
    async with SessionFactory() as db:
        await preferences.remember(db, user_id, key.strip().lower(), value)
        await db.commit()
    return {"remembered": {key: value}}


@server.tool()
async def forget(key: str) -> dict[str, Any]:
    """Drop something previously remembered."""
    user_id = current_user_id()
    async with SessionFactory() as db:
        removed = await preferences.forget(db, user_id, key.strip().lower())
        await db.commit()
    return {"forgotten": removed}
