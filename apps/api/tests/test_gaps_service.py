import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import WishlistSource
from pokedex.integrations.tcgdex import CardPayload, SetPayload, normalize_name
from pokedex.schemas.collection import AddCardRequest
from pokedex.schemas.gaps import AddWishlistRequest
from pokedex.services import catalog, collection, gaps, wishlist
from pokedex.services.collection import CardNotFoundError


def card(card_id: str, set_id: str, number: str, name: str) -> CardPayload:
    return CardPayload(
        id=card_id,
        set_id=set_id,
        species_id=None,
        category="Pokemon",
        number=number,
        number_prefix=number,
        name=name,
        name_normalized=normalize_name(name),
        rarity=None,
        variants={},
        hp=None,
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
async def started(db: AsyncSession, user_id: str) -> AsyncSession:
    """One set the user has started, and one they have never touched."""
    await catalog.upsert_sets(db, [card_set("g1", "Started", 3), card_set("g2", "Untouched", 2)])
    await catalog.upsert_cards(
        db,
        [
            card("g1-1", "g1", "1", "Alpha"),
            card("g1-2", "g1", "2", "Beta"),
            card("g1-3", "g1", "3", "Gamma"),
            card("g2-1", "g2", "1", "Delta"),
        ],
    )
    await collection.add_card(db, user_id, AddCardRequest(card_id="g1-1"))
    return db


async def test_gaps_cover_only_sets_the_user_started(
    started: AsyncSession, user_id: str
) -> None:
    """A set never begun is not a gap: every card ever printed would qualify."""
    found = await gaps.find_gaps(started, user_id)

    assert [gap.set_id for gap in found] == ["g1"]
    assert sorted(c.id for c in found[0].missing) == ["g1-2", "g1-3"]


async def test_owned_cards_are_not_reported_missing(
    started: AsyncSession, user_id: str
) -> None:
    found = await gaps.find_gaps(started, user_id)

    assert "g1-1" not in {c.id for c in found[0].missing}


async def test_totals_count_without_listing(started: AsyncSession, user_id: str) -> None:
    assert await gaps.set_totals(started, user_id) == {"Started": 2}
    assert await gaps.count_missing(started, user_id) == 2


async def test_a_user_with_nothing_has_no_gaps(
    started: AsyncSession, other_user_id: str
) -> None:
    assert await gaps.find_gaps(started, other_user_id) == []


async def test_agent_suggestions_are_marked_as_such(
    started: AsyncSession, user_id: str
) -> None:
    """added_by is what makes the suggestion's conversion measurable later."""
    await wishlist.add(
        started,
        user_id,
        AddWishlistRequest(card_id="g1-2", reason="Completa el set"),
        added_by=WishlistSource.AGENT,
    )

    items = await wishlist.list_items(started, user_id)
    assert [item.added_by for item in items] == [WishlistSource.AGENT]
    assert items[0].reason == "Completa el set"


async def test_a_user_re_adding_takes_ownership_of_the_entry(
    started: AsyncSession, user_id: str
) -> None:
    await wishlist.add(
        started, user_id, AddWishlistRequest(card_id="g1-2"), added_by=WishlistSource.AGENT
    )
    await wishlist.add(
        started, user_id, AddWishlistRequest(card_id="g1-2"), added_by=WishlistSource.USER
    )

    items = await wishlist.list_items(started, user_id)
    assert len(items) == 1
    assert items[0].added_by is WishlistSource.USER


async def test_suggesting_an_unknown_card_is_refused(
    started: AsyncSession, user_id: str
) -> None:
    with pytest.raises(CardNotFoundError):
        await wishlist.add(
            started, user_id, AddWishlistRequest(card_id="nope"), added_by=WishlistSource.AGENT
        )


async def test_a_wishlist_is_not_visible_to_another_user(
    started: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await wishlist.add(
        started, user_id, AddWishlistRequest(card_id="g1-2"), added_by=WishlistSource.USER
    )

    assert await wishlist.list_items(started, other_user_id) == []
