import asyncio
import sys

from pokedex.db import SessionFactory, engine
from pokedex.services.sync import sync_set

DEFAULT_SETS = ["base1"]

USAGE = """\
Usage: pokedex-sync [SET_ID ...]

Caches sets from tcgdex and the species their cards depict. The scanner can only
identify cards that are cached.

Defaults to base1. Set ids come from https://api.tcgdex.net/v2/en/sets
"""


async def _run(set_ids: list[str]) -> None:
    async with SessionFactory() as db:
        for set_id in set_ids:
            report = await sync_set(db, set_id)
            print(f"{report.set_id}: {report.cards} cards, {report.species} species")
            if report.failed:
                print(f"  failed: {', '.join(report.failed)}")
    await engine.dispose()


def sync() -> None:
    args = sys.argv[1:]
    if {"-h", "--help"} & set(args):
        print(USAGE)
        return

    asyncio.run(_run(args or DEFAULT_SETS))
