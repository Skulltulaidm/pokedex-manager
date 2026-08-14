import argparse
import asyncio
import sys

from pokedex import seed as seeding
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


async def _seed(count: int, cards: int | None, run_seed: int, clear: bool) -> None:
    async with SessionFactory() as db:
        report = await seeding.seed_market(
            db, count=count, cards=cards, seed=run_seed, clear=clear
        )
        await db.commit()
    await engine.dispose()

    print(seeding.summary(report))


def seed() -> None:
    parser = argparse.ArgumentParser(
        prog="pokedex-seed",
        description=(
            "Fills the database with collectors, their cards, their want lists and "
            "the trades between them, so the app can be demoed and load checked "
            "against something that behaves like a real user base."
        ),
        epilog=(
            "Every row is keyed off the run seed, so running this twice with the "
            "same options writes nothing the second time. Seeded collectors have no "
            "credentials and cannot sign in; they exist to give the marketplace depth."
        ),
    )
    parser.add_argument(
        "--count", type=int, default=seeding.DEFAULT_COUNT, help="How many collectors."
    )
    parser.add_argument(
        "--cards",
        type=int,
        default=None,
        help="How many catalog cards to draw from. Defaults to the whole catalog.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=seeding.DEFAULT_SEED,
        help="Changes who gets generated. The same seed always generates the same people.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete previously seeded collectors first. Never touches anyone else.",
    )
    args = parser.parse_args()

    asyncio.run(_seed(args.count, args.cards, args.seed, args.reset))
