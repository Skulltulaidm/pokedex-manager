import re
import unicodedata
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Self

import httpx
from pydantic import BaseModel

BASE_URL = "https://api.tcgdex.net/v2/en"
TIMEOUT = httpx.Timeout(15.0, connect=5.0)
HEADERS = {"User-Agent": "pokedex-manager/0.1"}

_NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")
# Collector numbers are printed as "4", "SV49" or "H12"; the leading run is the
# part that identifies the slot within a set.
_NUMBER_PREFIX = re.compile(r"^[A-Za-z]*\d+")


def normalize_name(value: str) -> str:
    """Fold to lowercase ASCII for trigram matching against scanned names."""
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_only = decomposed.encode("ascii", "ignore").decode()
    return _NON_ALPHANUMERIC.sub(" ", ascii_only.lower()).strip()


def number_prefix(local_id: str) -> str:
    match = _NUMBER_PREFIX.match(local_id)
    return match.group(0) if match else local_id


def image_urls(base: str | None) -> tuple[str | None, str | None]:
    """tcgdex returns a stem; quality and extension are appended by the caller."""
    if not base:
        return None, None
    return f"{base}/low.webp", f"{base}/high.webp"


class SetPayload(BaseModel):
    id: str
    name: str
    series: str | None
    printed_total: int
    total: int | None
    release_date: date | None
    logo_url: str | None
    symbol_url: str | None
    card_ids: list[str]


class CardPayload(BaseModel):
    id: str
    set_id: str
    species_id: int | None
    category: str
    number: str
    number_prefix: str
    name: str
    name_normalized: str
    rarity: str | None
    variants: dict[str, bool]
    hp: int | None
    image_small_url: str | None
    image_large_url: str | None
    price_eur: Decimal | None = None
    price_updated_at: datetime | None = None


def build_set(data: dict[str, Any]) -> SetPayload:
    counts = data.get("cardCount") or {}
    serie = data.get("serie") or {}
    released = data.get("releaseDate")

    return SetPayload(
        id=data["id"],
        name=data["name"],
        series=serie.get("name"),
        printed_total=counts["official"],
        total=counts.get("total"),
        release_date=date.fromisoformat(released) if released else None,
        logo_url=data.get("logo"),
        symbol_url=data.get("symbol"),
        card_ids=[card["id"] for card in data.get("cards", [])],
    )


def market_price(pricing: dict[str, Any] | None) -> tuple[Decimal | None, datetime | None]:
    """Cardmarket's trend price, which smooths the spikes a single sale causes.

    Only one source is read: mixing marketplaces in one column would produce a
    total nobody could interpret.
    """
    market = (pricing or {}).get("cardmarket") or {}
    trend = market.get("trend")
    if trend is None:
        return None, None

    updated = market.get("updated")
    stamp = None
    if updated:
        # The column is naive like every other timestamp here, so the value is
        # normalised to UTC before the offset is dropped.
        aware = datetime.fromisoformat(updated.replace("Z", "+00:00"))
        stamp = aware.astimezone(UTC).replace(tzinfo=None)

    return Decimal(str(trend)), stamp


def build_card(data: dict[str, Any]) -> CardPayload:
    local_id = str(data["localId"])
    dex_ids = data.get("dexId") or []
    small, large = image_urls(data.get("image"))
    price, price_updated = market_price(data.get("pricing"))

    return CardPayload(
        id=data["id"],
        set_id=data["set"]["id"],
        # A card can list several dex ids (dual-species cards); the first is the
        # one the card is filed under.
        species_id=dex_ids[0] if dex_ids else None,
        category=data.get("category") or "Unknown",
        number=local_id,
        number_prefix=number_prefix(local_id),
        name=data["name"],
        name_normalized=normalize_name(data["name"]),
        rarity=data.get("rarity"),
        variants=data.get("variants") or {},
        hp=data.get("hp"),
        image_small_url=small,
        image_large_url=large,
        price_eur=price,
        price_updated_at=price_updated,
    )


class TcgdexClient:
    def __init__(
        self, client: httpx.AsyncClient | None = None, base_url: str = BASE_URL
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = client or httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS)
        self._owns_client = client is None

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def _get(self, path: str) -> dict[str, Any]:
        response = await self._client.get(f"{self._base_url}{path}")
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def fetch_set(self, set_id: str) -> SetPayload:
        return build_set(await self._get(f"/sets/{set_id}"))

    async def fetch_card(self, card_id: str) -> CardPayload:
        return build_card(await self._get(f"/cards/{card_id}"))
