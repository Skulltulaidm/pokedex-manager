from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import CardPrice, CardSet
from pokedex.integrations.tcgdex import TcgdexClient
from pokedex.services import catalog
from pokedex.services.sync import gather_cards


@dataclass(frozen=True, slots=True)
class PriceRefresh:
    sets: int
    cards: int
    skipped: bool


async def has_readings_for(db: AsyncSession, day: date) -> bool:
    count = await db.scalar(
        select(func.count()).select_from(CardPrice).where(CardPrice.recorded_on == day)
    )
    return bool(count)


async def refresh_prices(db: AsyncSession, client: TcgdexClient | None = None) -> PriceRefresh:
    """Take today's reading for every cached set.

    A portfolio without a series is a single number: cost against value today,
    with nothing to say about the week. Nothing was writing that series — the
    sync is a command someone runs by hand — so every change panel read +0.0%
    over one point.

    Only prices are written: cards and species come from the sync, and a price
    reading should not wait on either.
    """
    if await has_readings_for(db, date.today()):
        return PriceRefresh(sets=0, cards=0, skipped=True)

    set_ids = list((await db.scalars(select(CardSet.id).order_by(CardSet.id))).all())
    if not set_ids:
        return PriceRefresh(sets=0, cards=0, skipped=True)

    written = 0
    async with client or TcgdexClient() as tcg:
        for set_id in set_ids:
            card_set = await tcg.fetch_set(set_id)
            cards, _failed = await gather_cards(tcg, card_set.card_ids)
            written += await catalog.record_prices(db, cards)

    return PriceRefresh(sets=len(set_ids), cards=written, skipped=False)
