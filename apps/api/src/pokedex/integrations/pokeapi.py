from typing import Any, Self

import httpx
from pydantic import BaseModel

BASE_URL = "https://pokeapi.co/api/v2"
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
# PokeAPI sits behind a filter that answers 403 to unrecognized clients.
HEADERS = {"User-Agent": "pokedex-manager/0.1"}

_GENERATION_NUMERALS = {
    "i": 1,
    "ii": 2,
    "iii": 3,
    "iv": 4,
    "v": 5,
    "vi": 6,
    "vii": 7,
    "viii": 8,
    "ix": 9,
    "x": 10,
}


class SpeciesPayload(BaseModel):
    """Normalized species record, assembled from two PokeAPI endpoints."""

    id: int
    name: str
    generation: int
    types: list[str]
    stats: dict[str, int]
    evolution_chain_id: int | None
    sprite_url: str | None


def parse_generation(value: str) -> int:
    """`generation-iii` -> 3."""
    numeral = value.rsplit("-", 1)[-1].lower()
    try:
        return _GENERATION_NUMERALS[numeral]
    except KeyError as exc:
        raise ValueError(f"unrecognized generation: {value!r}") from exc


def parse_trailing_id(url: str) -> int | None:
    """`https://pokeapi.co/api/v2/evolution-chain/12/` -> 12."""
    parts = [segment for segment in url.split("/") if segment]
    if not parts:
        return None
    return int(parts[-1]) if parts[-1].isdigit() else None


def build_species(pokemon: dict[str, Any], species: dict[str, Any]) -> SpeciesPayload:
    chain = species.get("evolution_chain") or {}

    return SpeciesPayload(
        # The species endpoint is authoritative: a Pokemon record can carry a
        # form id (10033) while its species keeps the national dex number.
        id=species["id"],
        name=species["name"],
        generation=parse_generation(species["generation"]["name"]),
        types=[entry["type"]["name"] for entry in pokemon["types"]],
        stats={entry["stat"]["name"]: entry["base_stat"] for entry in pokemon["stats"]},
        evolution_chain_id=parse_trailing_id(chain["url"]) if chain.get("url") else None,
        sprite_url=(pokemon.get("sprites") or {}).get("front_default"),
    )


class PokeApiClient:
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

    async def fetch_species(self, dex_id: int) -> SpeciesPayload:
        pokemon = await self._get(f"/pokemon/{dex_id}")
        species = await self._get(f"/pokemon-species/{dex_id}")
        return build_species(pokemon, species)

    async def list_species_ids(self, limit: int = 2000) -> list[int]:
        payload = await self._get(f"/pokemon-species?limit={limit}")
        ids = [parse_trailing_id(entry["url"]) for entry in payload["results"]]
        return [dex_id for dex_id in ids if dex_id is not None]
