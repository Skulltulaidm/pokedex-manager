import asyncio
import sys

from pokedex.db import SessionFactory, engine
from pokedex.services.sync import sync_set

DEFAULT_SETS = ["base1"]


async def _run(set_ids: list[str]) -> None:
    async with SessionFactory() as db:
        for set_id in set_ids:
            report = await sync_set(db, set_id)
            print(f"{report.set_id}: {report.cards} cards, {report.species} species")
            if report.failed:
                print(f"  failed: {', '.join(report.failed)}")
    await engine.dispose()


def sync() -> None:
    """Seed the catalog cache. Without it the scanner has nothing to match against."""
    asyncio.run(_run(sys.argv[1:] or DEFAULT_SETS))
