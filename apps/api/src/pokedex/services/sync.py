import asyncio
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.integrations.pokeapi import PokeApiClient, SpeciesPayload
from pokedex.integrations.tcgdex import CardPayload, TcgdexClient
from pokedex.services import catalog

CONCURRENCY = 8


@dataclass(frozen=True, slots=True)
class SyncReport:
    set_id: str
    cards: int
    species: int
    failed: list[str]


async def gather_cards(
    client: TcgdexClient, card_ids: list[str]
) -> tuple[list[CardPayload], list[str]]:
    limit = asyncio.Semaphore(CONCURRENCY)
    failed: list[str] = []

    async def one(card_id: str) -> CardPayload | None:
        async with limit:
            try:
                return await client.fetch_card(card_id)
            except Exception:
                failed.append(card_id)
                return None

    results = await asyncio.gather(*(one(card_id) for card_id in card_ids))
    return [card for card in results if card is not None], failed


async def sync_set(db: AsyncSession, set_id: str) -> SyncReport:
    """Cache a whole set: its cards, and the species those cards depict.

    Species are written before cards because the card table references them.
    """
    async with TcgdexClient() as tcg:
        card_set = await tcg.fetch_set(set_id)
        await catalog.upsert_sets(db, [card_set])
        cards, failed = await gather_cards(tcg, card_set.card_ids)

    dex_ids = sorted({card.species_id for card in cards if card.species_id is not None})
    written_species = 0
    if dex_ids:
        async with PokeApiClient() as pokeapi:
            limit = asyncio.Semaphore(CONCURRENCY)

            async def one(dex_id: int) -> SpeciesPayload:
                async with limit:
                    return await pokeapi.fetch_species(dex_id)

            species = await asyncio.gather(*(one(dex_id) for dex_id in dex_ids))
        written_species = await catalog.upsert_species(db, species)

    written_cards = await catalog.upsert_cards(db, cards)
    await catalog.record_prices(db, cards)
    await db.commit()

    return SyncReport(set_id, written_cards, written_species, failed)
