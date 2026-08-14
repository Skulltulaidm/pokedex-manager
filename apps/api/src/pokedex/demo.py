import asyncio
import itertools
import os
import random
import sys
from dataclasses import dataclass, field
from decimal import Decimal

import httpx

PASSWORD = "pokedex2026"

USAGE = """\
Usage: pokedex-demo [--web URL] [--api URL]

Creates three signed-in-able accounts, each shaped to show the app from a
different angle. Safe to re-run: an account that already exists is left alone.

Defaults to http://localhost:3000 and http://localhost:8010.
"""


@dataclass(frozen=True, slots=True)
class Profile:
    email: str
    name: str
    angle: str
    owned: int
    duplicates: int
    wishes: int
    costed: bool
    listings: int = 0
    conditions: tuple[str, ...] = field(default=("near_mint",))


# One account per question the app answers. A single demo account with a bit of
# everything shows none of them well.
PROFILES = (
    Profile(
        email="coleccionista@pokedex.test",
        name="AshKetchum99",
        angle="portfolio",
        owned=34,
        duplicates=0,
        wishes=6,
        costed=True,
        conditions=("mint", "near_mint", "lightly_played"),
    ),
    Profile(
        email="trader@pokedex.test",
        name="xX_TradeLord_Xx",
        angle="trading",
        owned=18,
        duplicates=9,
        wishes=10,
        costed=False,
        listings=3,
        conditions=("near_mint", "lightly_played", "moderately_played"),
    ),
    Profile(
        email="novato@pokedex.test",
        name="PikaRookie",
        angle="onboarding",
        owned=2,
        duplicates=0,
        wishes=4,
        costed=False,
    ),
)


class Session:
    """One demo account, talking to the app the way a browser does."""

    def __init__(self, web: str, api: str, client: httpx.AsyncClient) -> None:
        self.web = web
        self.api = api
        self.client = client
        self.token = ""

    async def sign_up(self, profile: Profile) -> bool:
        """True when the account is new. Better Auth owns the hashing, so the
        credential is created by signing up rather than by writing a row."""
        response = await self.client.post(
            f"{self.web}/api/auth/sign-up/email",
            json={"email": profile.email, "password": PASSWORD, "name": profile.name},
        )
        if response.status_code >= 400:
            await self.client.post(
                f"{self.web}/api/auth/sign-in/email",
                json={"email": profile.email, "password": PASSWORD},
            )
            await self._take_token()
            return False
        await self._take_token()
        return True

    async def _take_token(self) -> None:
        response = await self.client.get(f"{self.web}/api/auth/token")
        response.raise_for_status()
        self.token = response.json()["token"]

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    async def cards(self, count: int) -> list[dict[str, object]]:
        response = await self.client.get(
            f"{self.api}/api/v1/catalog/market",
            params={"limit": count, "sort": "price", "owned": "all"},
            headers=self.headers,
        )
        response.raise_for_status()
        return [row["card"] for row in response.json()["items"]]

    async def add(self, card_id: str, **body: object) -> None:
        await self.client.post(
            f"{self.api}/api/v1/collection",
            json={"card_id": card_id, **body},
            headers=self.headers,
        )

    async def wish(self, card_id: str, reason: str) -> None:
        await self.client.post(
            f"{self.api}/api/v1/wishlist",
            json={"card_id": card_id, "reason": reason},
            headers=self.headers,
        )

    async def publish(self, give: list[str], want: list[str], note: str) -> bool:
        response = await self.client.post(
            f"{self.api}/api/v1/trades/listings",
            json={
                "give": [{"card_id": card_id} for card_id in give],
                "want": want,
                "note": note,
            },
            headers=self.headers,
        )
        return response.status_code < 400


NOTES = (
    "Busco completar Base Set, cambio lo que sea.",
    "Todo en buen estado, mando fotos si quieres.",
    "Prefiero cambios de valor parecido.",
)

REASONS = (
    "Me falta para el set",
    "Siempre la quise",
    "La vi barata y la quiero",
    "Para completar la línea evolutiva",
)


async def build(session: Session, profile: Profile, rng: random.Random) -> str:
    pool = await session.cards(90)
    if not pool:
        return "el catálogo está vacío: corre pokedex-sync primero"

    held = rng.sample(pool, min(profile.owned, len(pool)))
    for index, card in enumerate(held):
        price = card.get("price_usd")
        # Paid a little under market on some, over on others, so the portfolio
        # has both sides to report rather than a uniform gain.
        cost = None
        if profile.costed and price is not None:
            paid = Decimal(str(price)) * Decimal(str(rng.uniform(0.6, 1.3)))
            cost = str(paid.quantize(Decimal("0.01")))
        await session.add(
            str(card["id"]),
            quantity=2 if index < profile.duplicates else 1,
            condition=rng.choice(profile.conditions),
            unit_cost_usd=cost,
        )

    missing = [card for card in pool if card not in held]
    for card in rng.sample(missing, min(profile.wishes, len(missing))):
        await session.wish(str(card["id"]), rng.choice(REASONS))

    published = 0
    spares = held[: profile.duplicates]
    for index in range(profile.listings):
        if index >= len(spares) or not missing:
            break
        want = rng.sample(missing, min(2, len(missing)))
        if await session.publish(
            [str(spares[index]["id"])],
            [str(card["id"]) for card in want],
            NOTES[index % len(NOTES)],
        ):
            published += 1

    return (
        f"{len(held)} cartas, {profile.duplicates} repetidas, "
        f"{profile.wishes} deseos, {published} publicaciones"
    )


async def _run(web: str, api: str) -> None:
    rng = random.Random(20260814)
    for profile in PROFILES:
        # One client per account: the session cookie is what identifies the
        # caller, so a shared client would file the second account's cards into
        # the first account's collection.
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            session = Session(web, api, client)
            fresh = await session.sign_up(profile)
            summary = await build(session, profile, rng) if fresh else "ya existía"
            print(f"{profile.email:32} {profile.angle:12} {summary}")
    print(f"\nContraseña para las tres: {PASSWORD}")


def demo() -> None:
    args = sys.argv[1:]
    if {"-h", "--help"} & set(args):
        print(USAGE)
        return

    web = os.environ.get("BETTER_AUTH_URL", "http://localhost:3000")
    api = os.environ.get("DEMO_API_URL", "http://localhost:8010")
    for flag, value in itertools.pairwise(args):
        if flag == "--web":
            web = value
        if flag == "--api":
            api = value

    asyncio.run(_run(web, api))
