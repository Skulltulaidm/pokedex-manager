import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.integrations.tcgdex import CardPayload, SetPayload, normalize_name
from pokedex.schemas.catalog import CardSetView, CardView
from pokedex.schemas.scan import CardCandidate, CardReading
from pokedex.services import catalog
from pokedex.services.resolve import _status, resolve


def card(card_id: str, set_id: str, number: str, name: str, hp: int | None) -> CardPayload:
    return CardPayload(
        id=card_id,
        set_id=set_id,
        species_id=None,
        category="Pokemon",
        number=number,
        number_prefix=number,
        name=name,
        name_normalized=normalize_name(name),
        rarity="Rare",
        variants={},
        hp=hp,
        image_small_url=None,
        image_large_url=None,
    )


def card_set(set_id: str, name: str, printed_total: int) -> SetPayload:
    return SetPayload(
        id=set_id,
        name=name,
        series="Base",
        printed_total=printed_total,
        total=printed_total,
        release_date=None,
        logo_url=None,
        symbol_url=None,
        card_ids=[],
    )


@pytest.fixture
async def catalogued(db: AsyncSession) -> AsyncSession:
    """Two sets that share collector numbers, so the totals have to break the tie."""
    await catalog.upsert_sets(
        db,
        [card_set("base1", "Base Set", 102), card_set("jungle", "Jungle", 64)],
    )
    await catalog.upsert_cards(
        db,
        [
            card("base1-4", "base1", "4", "Charizard", 120),
            card("base1-2", "base1", "2", "Blastoise", 100),
            card("jungle-4", "jungle", "4", "Clefable", 70),
            card("base1-58", "base1", "58", "Pikachu", 40),
        ],
    )
    return db


async def test_every_signal_agreeing_resolves(catalogued: AsyncSession) -> None:
    result = await resolve(
        catalogued,
        CardReading(name="Charizard", collector_number="4", set_total=102, hp=120),
    )

    assert result.status == "resolved"
    assert result.candidates[0].card.id == "base1-4"
    assert set(result.candidates[0].matched_on) == {
        "set_total",
        "collector_number",
        "name",
        "hp",
    }


async def test_set_total_breaks_a_tie_between_identical_numbers(
    catalogued: AsyncSession,
) -> None:
    """Two sets hold a number 4; only the printed total says which one was scanned."""
    result = await resolve(catalogued, CardReading(collector_number="4", set_total=64))

    assert result.candidates[0].card.id == "jungle-4"


async def test_a_misread_field_does_not_discard_the_right_card(
    catalogued: AsyncSession,
) -> None:
    """The whole reason for scoring instead of filtering.

    HP here is wrong — the model misread 120 as 20. A filter on HP would drop
    Charizard entirely; a weight simply stops contributing.
    """
    result = await resolve(
        catalogued,
        CardReading(name="Charizard", collector_number="4", set_total=102, hp=20),
    )

    assert result.candidates[0].card.id == "base1-4"
    assert "hp" not in result.candidates[0].matched_on
    assert result.status == "resolved"


async def test_a_name_alone_cannot_identify_a_printing(catalogued: AsyncSession) -> None:
    """A name is worth 0.25 at most, which never clears the plausibility bar.

    That is the honest answer rather than a shortcoming: the same Pokemon is
    printed in dozens of sets, so a name on its own identifies no single card.
    The scan reports failure and the user falls back to searching by name.
    """
    result = await resolve(catalogued, CardReading(name="Charizard"))

    assert result.status == "failed"


async def test_a_reading_with_nothing_legible_fails(catalogued: AsyncSession) -> None:
    result = await resolve(catalogued, CardReading())

    assert result.status == "failed"
    assert result.candidates == []


async def test_a_reading_that_matches_nothing_fails(catalogued: AsyncSession) -> None:
    result = await resolve(
        catalogued, CardReading(name="Zzzzz", collector_number="9999", set_total=99999)
    )

    assert result.status == "failed"


async def test_a_hallucinated_number_is_treated_as_unread(
    catalogued: AsyncSession,
) -> None:
    """Out-of-range values would abort the query, not merely score badly."""
    reading = CardReading(name="Charizard", collector_number="4", set_total=99999, hp=120)

    assert reading.set_total is None
    result = await resolve(catalogued, reading)
    assert result.candidates[0].card.id == "base1-4"


async def test_candidates_come_back_ranked(catalogued: AsyncSession) -> None:
    result = await resolve(catalogued, CardReading(collector_number="4", set_total=102))

    scores = [candidate.score for candidate in result.candidates]
    assert scores == sorted(scores, reverse=True)


CARD_VIEW = CardView(
    id="base1-4",
    name="Charizard",
    category="Pokemon",
    number="4",
    rarity="Rare",
    variants={},
    hp=120,
    image_small_url=None,
    image_large_url=None,
    card_set=CardSetView(
        id="base1",
        name="Base Set",
        series="Base",
        printed_total=102,
        release_date=None,
        logo_url=None,
    ),
    species=None,
)


def candidate(score: float) -> CardCandidate:
    return CardCandidate(card=CARD_VIEW, score=score, matched_on=[])


def test_a_clear_winner_settles_the_scan() -> None:
    assert _status([candidate(1.0), candidate(0.45)]) == "resolved"


def test_a_narrow_lead_stays_ambiguous() -> None:
    """0.75 over 0.6 is a lead, not a decision: both are shown to the user."""
    assert _status([candidate(0.75), candidate(0.6)]) == "ambiguous"


def test_a_strong_but_lonely_score_below_the_bar_fails() -> None:
    assert _status([candidate(0.35)]) == "failed"


def test_no_candidates_at_all_fails() -> None:
    assert _status([]) == "failed"
