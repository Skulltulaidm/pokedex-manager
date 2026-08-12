import json
from datetime import date
from pathlib import Path

import httpx
import pytest

from pokedex.integrations.tcgdex import (
    TcgdexClient,
    build_card,
    build_set,
    image_urls,
    normalize_name,
    number_prefix,
)

FIXTURES = Path(__file__).parent / "fixtures" / "tcgdex"


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


@pytest.mark.parametrize(
    ("printed", "expected"),
    [("4", "4"), ("SV49", "SV49"), ("H12", "H12"), ("102a", "102"), ("TG05", "TG05")],
)
def test_number_prefix_keeps_the_slot_identifier(printed: str, expected: str) -> None:
    assert number_prefix(printed) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Charizard", "charizard"),
        ("Farfetch'd", "farfetch d"),
        ("Nidoran♀", "nidoran"),
        ("Flabébé", "flabebe"),
        ("Mr. Mime", "mr mime"),
    ],
)
def test_normalize_name_folds_to_ascii(raw: str, expected: str) -> None:
    assert normalize_name(raw) == expected


def test_image_urls_appends_quality_and_extension() -> None:
    small, large = image_urls("https://assets.test/base1/4")
    assert small == "https://assets.test/base1/4/low.webp"
    assert large == "https://assets.test/base1/4/high.webp"


def test_image_urls_tolerates_missing_stem() -> None:
    assert image_urls(None) == (None, None)


def test_build_set_from_real_payload() -> None:
    parsed = build_set(load("set_base1.json"))

    assert parsed.id == "base1"
    assert parsed.name == "Base Set"
    assert parsed.series == "Base"
    # The denominator printed on the cards, not the count including secrets.
    assert parsed.printed_total == 102
    assert parsed.release_date == date(1999, 1, 9)
    assert parsed.card_ids[0] == "base1-1"


def test_build_card_links_species_from_dex_id() -> None:
    card = build_card(load("card_base1-4.json"))

    assert card.id == "base1-4"
    assert card.set_id == "base1"
    assert card.species_id == 6
    assert card.category == "Pokemon"
    assert card.number == "4"
    assert card.number_prefix == "4"
    assert card.name_normalized == "charizard"
    assert card.hp == 120
    assert card.variants["holo"] is True
    assert card.variants["normal"] is False


def test_build_card_leaves_trainer_without_species() -> None:
    card = build_card(load("card_base1-88.json"))

    assert card.category == "Trainer"
    assert card.species_id is None
    assert card.hp is None


async def test_fetch_card_hits_the_expected_path() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return httpx.Response(200, json=load("card_base1-4.json"))

    transport = httpx.MockTransport(handler)
    async with TcgdexClient(client=httpx.AsyncClient(transport=transport)) as client:
        card = await client.fetch_card("base1-4")

    assert seen == ["/v2/en/cards/base1-4"]
    assert card.name == "Charizard"


async def test_fetch_set_raises_on_http_error() -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(500))
    async with TcgdexClient(client=httpx.AsyncClient(transport=transport)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            await client.fetch_set("nope")
