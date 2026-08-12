from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import ScanStatus
from pokedex.schemas.catalog import CardSetView, CardView
from pokedex.schemas.scan import CardCandidate, CardReading, ScanResult
from pokedex.services import scan as scans
from pokedex.storage import LocalFilesystemStorage


def card_view(card_id: str) -> CardView:
    return CardView(
        id=card_id,
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


def result(status: str, card_ids: list[str]) -> ScanResult:
    return ScanResult(
        reading=CardReading(name="Charizard"),
        candidates=[
            CardCandidate(card=card_view(card_id), score=0.9, matched_on=["name"])
            for card_id in card_ids
        ],
        status=status,  # type: ignore[arg-type]
    )


async def test_the_key_carries_the_owner(tmp_path: Path) -> None:
    storage = LocalFilesystemStorage(tmp_path)

    scan_id, key = await scans.store_image(storage, "alex", b"\xff\xd8\xffbytes")

    assert key == f"alex/{scan_id}.jpg"
    assert await storage.get(key) == b"\xff\xd8\xffbytes"


async def test_a_resolved_scan_records_the_winner(
    db: AsyncSession, user_id: str
) -> None:
    scan_id = uuid4()

    scan = await scans.record(
        db,
        scan_id,
        user_id,
        "k.jpg",
        CardReading(name="Charizard"),
        result("resolved", ["base1-4", "base1-3"]),
        model="test",
    )

    assert scan.status is ScanStatus.RESOLVED
    assert scan.resolved_card_id == "base1-4"
    assert scan.candidate_ids == ["base1-4", "base1-3"]


async def test_an_ambiguous_scan_resolves_to_nothing(
    db: AsyncSession, user_id: str
) -> None:
    """Candidates are kept, but no card is chosen: that decision is the user's."""
    scan = await scans.record(
        db,
        uuid4(),
        user_id,
        "k.jpg",
        CardReading(),
        result("ambiguous", ["base1-4", "base1-3"]),
        model="test",
    )

    assert scan.status is ScanStatus.AMBIGUOUS
    assert scan.resolved_card_id is None
    assert scan.candidate_ids == ["base1-4", "base1-3"]


async def test_a_scan_is_recorded_even_when_vision_produced_nothing(
    db: AsyncSession, user_id: str
) -> None:
    """The row is what makes a retry possible without paying for vision again."""
    scan = await scans.record(
        db, uuid4(), user_id, "k.jpg", None, None, model=None
    )

    assert scan.status is ScanStatus.FAILED
    assert scan.extracted is None
    assert scan.image_key == "k.jpg"


async def test_a_scan_is_not_readable_by_another_user(
    db: AsyncSession, user_id: str, other_user_id: str
) -> None:
    scan_id = uuid4()
    await scans.record(
        db, scan_id, user_id, "k.jpg", CardReading(), result("resolved", ["base1-4"]), None
    )

    assert await scans.get_scan(db, user_id, scan_id) is not None
    assert await scans.get_scan(db, other_user_id, scan_id) is None


async def test_a_missing_scan_is_none(db: AsyncSession, user_id: str) -> None:
    assert await scans.get_scan(db, user_id, UUID(int=0)) is None
