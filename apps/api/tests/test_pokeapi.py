import json
from pathlib import Path

import httpx
import pytest

from pokedex.integrations.pokeapi import (
    PokeApiClient,
    build_species,
    parse_generation,
    parse_trailing_id,
)

FIXTURES = Path(__file__).parent / "fixtures" / "pokeapi"


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def test_parse_generation_maps_roman_numerals() -> None:
    assert parse_generation("generation-i") == 1
    assert parse_generation("generation-iii") == 3
    assert parse_generation("generation-ix") == 9


def test_parse_generation_rejects_unknown() -> None:
    with pytest.raises(ValueError):
        parse_generation("generation-xiv")


def test_parse_trailing_id_handles_trailing_slash() -> None:
    assert parse_trailing_id("https://pokeapi.co/api/v2/evolution-chain/12/") == 12
    assert parse_trailing_id("https://pokeapi.co/api/v2/evolution-chain/") is None


def test_build_species_from_real_payloads() -> None:
    species = build_species(load("pokemon_1.json"), load("pokemon_species_1.json"))

    assert species.id == 1
    assert species.name == "bulbasaur"
    assert species.generation == 1
    assert species.types == ["grass", "poison"]
    assert species.stats["hp"] == 45
    assert species.stats["special-attack"] == 65
    assert species.evolution_chain_id == 1
    assert species.sprite_url is not None


def test_build_species_prefers_the_species_id_over_the_form_id() -> None:
    pokemon = load("pokemon_1.json") | {"id": 10033}
    species = build_species(pokemon, load("pokemon_species_1.json"))

    assert species.id == 1


async def test_fetch_species_calls_both_endpoints() -> None:
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(request.url.path)
        name = (
            "pokemon_species_1.json"
            if "pokemon-species" in request.url.path
            else "pokemon_1.json"
        )
        return httpx.Response(200, json=load(name))

    transport = httpx.MockTransport(handler)
    async with PokeApiClient(client=httpx.AsyncClient(transport=transport)) as client:
        species = await client.fetch_species(1)

    assert requested == ["/api/v2/pokemon/1", "/api/v2/pokemon-species/1"]
    assert species.name == "bulbasaur"


async def test_fetch_species_raises_on_http_error() -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(404))
    async with PokeApiClient(client=httpx.AsyncClient(transport=transport)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            await client.fetch_species(99999)
