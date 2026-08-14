from datetime import date
from decimal import Decimal
from uuid import UUID

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import (
    CardCondition,
    ListingStatus,
    OfferStatus,
    TradeListing,
    WishlistSource,
)
from pokedex.integrations.pokeapi import SpeciesPayload
from pokedex.integrations.tcgdex import CardPayload, SetPayload
from pokedex.schemas.collection import AddCardRequest, UpdateItemRequest
from pokedex.schemas.common import Page
from pokedex.schemas.gaps import AddWishlistRequest
from pokedex.schemas.trade import (
    CreateListingRequest,
    CreateOfferRequest,
    OfferCardInput,
    TradeListingView,
    TradeMatch,
)
from pokedex.services import catalog, collection, trade, wishlist

SET_ID = "base1"

CHARIZARD = SpeciesPayload(
    id=6,
    name="charizard",
    generation=1,
    types=["fire", "flying"],
    stats={"hp": 78},
    evolution_chain_id=2,
    sprite_url=None,
)
SQUIRTLE = SpeciesPayload(
    id=7,
    name="squirtle",
    generation=1,
    types=["water"],
    stats={"hp": 44},
    evolution_chain_id=3,
    sprite_url=None,
)
BASE_SET = SetPayload(
    id=SET_ID,
    name="Base Set",
    series="Base",
    printed_total=102,
    total=102,
    release_date=date(1999, 1, 9),
    logo_url=None,
    symbol_url=None,
    card_ids=[],
)


def card(
    card_id: str, species_id: int, name: str, number: str, price: Decimal | None
) -> CardPayload:
    return CardPayload(
        id=card_id,
        set_id=SET_ID,
        species_id=species_id,
        category="Pokemon",
        number=number,
        number_prefix=number,
        name=name,
        name_normalized=name.lower(),
        rarity="Rare",
        variants={},
        hp=100,
        image_small_url=None,
        image_large_url=None,
        price_usd=price,
    )


CHARIZARD_CARD = f"{SET_ID}-4"
SQUIRTLE_CARD = f"{SET_ID}-63"


def with_partner(matches: list[TradeMatch], partner_id: str) -> TradeMatch | None:
    """The match against one counterparty, if there is one.

    Matching is the only service that reads across users, so unlike every other
    one it sees rows the test did not create. Assertions name the counterparty
    they mean instead of describing the whole list, which whatever else lives in
    the database would otherwise decide.
    """
    return next((match for match in matches if match.partner_id == partner_id), None)


@pytest.fixture
async def catalogued(db: AsyncSession) -> AsyncSession:
    await catalog.upsert_species(db, [CHARIZARD, SQUIRTLE])
    await catalog.upsert_sets(db, [BASE_SET])
    await catalog.upsert_cards(
        db,
        [
            card(CHARIZARD_CARD, 6, "Charizard", "4", Decimal("100.00")),
            card(SQUIRTLE_CARD, 7, "Squirtle", "63", Decimal("10.00")),
        ],
    )
    return db


async def test_a_swap_needs_something_on_both_sides(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """Wanting what someone has spare is half a trade, and half is none."""
    await collection.add_card(
        catalogued, other_user_id, AddCardRequest(card_id=CHARIZARD_CARD, quantity=2)
    )
    await wishlist.add(
        catalogued, user_id, AddWishlistRequest(card_id=CHARIZARD_CARD), WishlistSource.USER
    )

    matches = await trade.find_matches(catalogued, user_id)
    assert with_partner(matches, other_user_id) is None


async def test_a_mutual_overlap_is_a_match(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await collection.add_card(
        catalogued, other_user_id, AddCardRequest(card_id=CHARIZARD_CARD, quantity=2)
    )
    await wishlist.add(
        catalogued, user_id, AddWishlistRequest(card_id=CHARIZARD_CARD), WishlistSource.USER
    )
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=SQUIRTLE_CARD, quantity=3)
    )
    await wishlist.add(
        catalogued, other_user_id, AddWishlistRequest(card_id=SQUIRTLE_CARD), WishlistSource.USER
    )

    match = with_partner(await trade.find_matches(catalogued, user_id), other_user_id)

    assert match is not None
    assert [entry.card.id for entry in match.you_get] == [CHARIZARD_CARD]
    assert [entry.card.id for entry in match.you_give] == [SQUIRTLE_CARD]


async def test_a_single_copy_is_not_spare(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """The only copy of a card is the collection, not inventory to trade."""
    await collection.add_card(catalogued, other_user_id, AddCardRequest(card_id=CHARIZARD_CARD))
    await wishlist.add(
        catalogued, user_id, AddWishlistRequest(card_id=CHARIZARD_CARD), WishlistSource.USER
    )
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=SQUIRTLE_CARD, quantity=2)
    )
    await wishlist.add(
        catalogued, other_user_id, AddWishlistRequest(card_id=SQUIRTLE_CARD), WishlistSource.USER
    )

    matches = await trade.find_matches(catalogued, user_id)
    assert with_partner(matches, other_user_id) is None


async def test_spare_copies_count_what_is_free_to_move(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await collection.add_card(
        catalogued, other_user_id, AddCardRequest(card_id=CHARIZARD_CARD, quantity=4)
    )
    await wishlist.add(
        catalogued, user_id, AddWishlistRequest(card_id=CHARIZARD_CARD), WishlistSource.USER
    )
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=SQUIRTLE_CARD, quantity=2)
    )
    await wishlist.add(
        catalogued, other_user_id, AddWishlistRequest(card_id=SQUIRTLE_CARD), WishlistSource.USER
    )

    match = with_partner(await trade.find_matches(catalogued, user_id), other_user_id)

    assert match is not None
    assert match.you_get[0].copies == 3
    assert match.you_give[0].copies == 1


async def test_the_balance_is_stated_from_the_readers_side(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """A hundred-dollar card for a ten-dollar one is ninety in the reader's favour."""
    await collection.add_card(
        catalogued, other_user_id, AddCardRequest(card_id=CHARIZARD_CARD, quantity=2)
    )
    await wishlist.add(
        catalogued, user_id, AddWishlistRequest(card_id=CHARIZARD_CARD), WishlistSource.USER
    )
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=SQUIRTLE_CARD, quantity=2)
    )
    await wishlist.add(
        catalogued, other_user_id, AddWishlistRequest(card_id=SQUIRTLE_CARD), WishlistSource.USER
    )

    match = with_partner(await trade.find_matches(catalogued, user_id), other_user_id)
    assert match is not None

    assert match.get_value == Decimal("100.00")
    assert match.give_value == Decimal("10.00")
    assert match.balance == Decimal("90.00")


async def test_an_unpriced_card_is_counted_rather_than_valued_at_zero(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await catalog.upsert_cards(catalogued, [card(f"{SET_ID}-99", 7, "Wartortle", "99", None)])
    await collection.add_card(
        catalogued, other_user_id, AddCardRequest(card_id=f"{SET_ID}-99", quantity=2)
    )
    await wishlist.add(
        catalogued, user_id, AddWishlistRequest(card_id=f"{SET_ID}-99"), WishlistSource.USER
    )
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=SQUIRTLE_CARD, quantity=2)
    )
    await wishlist.add(
        catalogued, other_user_id, AddWishlistRequest(card_id=SQUIRTLE_CARD), WishlistSource.USER
    )

    match = with_partner(await trade.find_matches(catalogued, user_id), other_user_id)
    assert match is not None

    assert match.get_value == Decimal("0.00")
    assert match.unpriced == 1


async def test_a_reader_is_never_their_own_counterparty(
    catalogued: AsyncSession, user_id: str
) -> None:
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=CHARIZARD_CARD, quantity=2)
    )
    await wishlist.add(
        catalogued, user_id, AddWishlistRequest(card_id=CHARIZARD_CARD), WishlistSource.USER
    )

    matches = await trade.find_matches(catalogued, user_id)
    assert with_partner(matches, user_id) is None


@pytest.fixture
async def swappable(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> AsyncSession:
    """Each side holds a spare the other could want."""
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=SQUIRTLE_CARD, quantity=2)
    )
    await collection.add_card(
        catalogued, other_user_id, AddCardRequest(card_id=CHARIZARD_CARD, quantity=2)
    )
    return catalogued


def card_input(card_id: str, condition: CardCondition | None = None) -> OfferCardInput:
    return OfferCardInput(card_id=card_id, condition=condition)


def an_offer(to_user: str) -> CreateOfferRequest:
    return CreateOfferRequest(
        to_user_id=to_user,
        offered=[card_input(SQUIRTLE_CARD)],
        requested=[card_input(CHARIZARD_CARD)],
    )


async def test_an_offer_reads_from_each_side(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """The same row is 'you give' to one collector and 'you get' to the other."""
    await trade.create_offer(swappable, user_id, an_offer(other_user_id))

    mine = (await trade.list_offers(swappable, user_id))[0]
    theirs = (await trade.list_offers(swappable, other_user_id))[0]

    assert mine.direction == "sent"
    assert [entry.card.id for entry in mine.you_give] == [SQUIRTLE_CARD]
    assert [entry.card.id for entry in mine.you_get] == [CHARIZARD_CARD]

    assert theirs.direction == "received"
    assert [entry.card.id for entry in theirs.you_give] == [CHARIZARD_CARD]
    assert [entry.card.id for entry in theirs.you_get] == [SQUIRTLE_CARD]
    assert theirs.balance == -mine.balance


async def test_an_offer_cannot_name_a_card_its_owner_lacks(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """Promising a card you do not hold twice is a promise you cannot keep."""
    with pytest.raises(trade.OfferError, match="Not spare in your collection"):
        await trade.create_offer(
            swappable,
            user_id,
            CreateOfferRequest(
                to_user_id=other_user_id,
                offered=[card_input(CHARIZARD_CARD)],
                requested=[card_input(CHARIZARD_CARD)],
            ),
        )


async def test_a_collector_cannot_offer_to_themselves(
    swappable: AsyncSession, user_id: str
) -> None:
    with pytest.raises(trade.OfferError, match="two collectors"):
        await trade.create_offer(swappable, user_id, an_offer(user_id))


async def test_only_the_recipient_answers(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """The author accepting their own offer would make agreement meaningless."""
    offer = await trade.create_offer(swappable, user_id, an_offer(other_user_id))

    assert await trade.respond_to_offer(swappable, user_id, offer.id, True) is None

    answered = await trade.respond_to_offer(swappable, other_user_id, offer.id, True)
    assert answered is not None
    assert answered.status is OfferStatus.ACCEPTED
    assert answered.responded_at is not None


async def test_an_answered_offer_cannot_be_answered_again(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    offer = await trade.create_offer(swappable, user_id, an_offer(other_user_id))
    await trade.respond_to_offer(swappable, other_user_id, offer.id, False)

    with pytest.raises(trade.OfferError, match="already declined"):
        await trade.respond_to_offer(swappable, other_user_id, offer.id, True)


async def test_only_the_author_withdraws(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    offer = await trade.create_offer(swappable, user_id, an_offer(other_user_id))

    assert await trade.withdraw_offer(swappable, other_user_id, offer.id) is None

    pulled = await trade.withdraw_offer(swappable, user_id, offer.id)
    assert pulled is not None
    assert pulled.status is OfferStatus.WITHDRAWN


async def test_accepting_moves_no_cards(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """Agreement is not delivery: only the collector holding the card knows."""
    before = await collection.total_quantity(swappable, user_id)
    offer = await trade.create_offer(swappable, user_id, an_offer(other_user_id))

    await trade.respond_to_offer(swappable, other_user_id, offer.id, True)

    assert await collection.total_quantity(swappable, user_id) == before


async def test_an_offer_is_private_to_its_two_parties(
    swappable: AsyncSession, user_id: str, other_user_id: str, db: AsyncSession
) -> None:
    await trade.create_offer(swappable, user_id, an_offer(other_user_id))

    assert await trade.list_offers(swappable, "test-nobody") == []


async def test_spares_mark_what_the_viewer_wants(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """Shopping starts from what you came for, so wants sort first."""
    await wishlist.add(
        swappable, user_id, AddWishlistRequest(card_id=CHARIZARD_CARD), WishlistSource.USER
    )

    page = await trade.spare_page(swappable, other_user_id, viewer_id=user_id)

    assert [entry.card.id for entry in page.items] == [CHARIZARD_CARD]
    assert page.items[0].wanted is True
    assert page.items[0].copies == 1


async def test_spares_never_include_a_last_copy(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await collection.add_card(
        catalogued, other_user_id, AddCardRequest(card_id=CHARIZARD_CARD)
    )

    page = await trade.spare_page(catalogued, other_user_id, viewer_id=user_id)

    assert page.total == 0


async def test_spares_can_be_searched(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    page = await trade.spare_page(
        swappable, other_user_id, viewer_id=user_id, search="chari"
    )
    empty = await trade.spare_page(
        swappable, other_user_id, viewer_id=user_id, search="zzzz"
    )

    assert page.total == 1
    assert empty.total == 0


async def test_a_collector_is_listed_without_a_mutual_swap(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """Someone holding what you want is worth seeing even if you have nothing
    they asked for: the offer is how you find out what they would take."""
    await wishlist.add(
        swappable, user_id, AddWishlistRequest(card_id=CHARIZARD_CARD), WishlistSource.USER
    )

    # Searched rather than read off the first page: like matching, this is a
    # service that sees every collector in the database, and a seeded one has
    # hundreds of them to be buried under.
    page = await trade.collector_page(swappable, user_id, search="dani")
    them = next(c for c in page.items if c.user_id == other_user_id)

    assert them.spares == 1
    assert them.you_want == 1
    assert them.they_want == 0
    assert await trade.find_matches(swappable, user_id) == []


async def test_a_collector_never_lists_themselves(
    swappable: AsyncSession, user_id: str
) -> None:
    page = await trade.collector_page(swappable, user_id)

    assert all(entry.user_id != user_id for entry in page.items)


def a_counter(to_user: str) -> CreateOfferRequest:
    return CreateOfferRequest(
        to_user_id=to_user,
        offered=[card_input(CHARIZARD_CARD)],
        requested=[card_input(SQUIRTLE_CARD)],
    )


async def test_a_counter_declines_what_it_answers(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """Both standing would let them accept terms that were just turned down."""
    original = await trade.create_offer(swappable, user_id, an_offer(other_user_id))

    countered = await trade.counter_offer(
        swappable, other_user_id, original.id, a_counter(user_id)
    )

    assert countered is not None
    assert countered.replies_to_id == original.id
    assert countered.status is OfferStatus.PENDING
    assert original.status is OfferStatus.DECLINED


async def test_only_the_recipient_counters(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    original = await trade.create_offer(swappable, user_id, an_offer(other_user_id))

    assert (
        await trade.counter_offer(swappable, user_id, original.id, a_counter(user_id))
        is None
    )


async def test_a_counter_answers_whoever_made_the_offer(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """An answer has one address."""
    original = await trade.create_offer(swappable, user_id, an_offer(other_user_id))

    with pytest.raises(trade.OfferError, match="answers whoever"):
        await trade.counter_offer(
            swappable, other_user_id, original.id, a_counter(other_user_id)
        )


async def test_an_answered_offer_cannot_be_countered(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    original = await trade.create_offer(swappable, user_id, an_offer(other_user_id))
    await trade.respond_to_offer(swappable, other_user_id, original.id, False)

    with pytest.raises(trade.OfferError, match="already declined"):
        await trade.counter_offer(
            swappable, other_user_id, original.id, a_counter(user_id)
        )


async def test_a_profile_counts_without_pricing(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """What a collection is worth is the owner's to say, so it is never here."""
    await wishlist.add(
        swappable, user_id, AddWishlistRequest(card_id=CHARIZARD_CARD), WishlistSource.USER
    )

    profile = await trade.collector_profile(swappable, other_user_id, viewer_id=user_id)

    assert profile is not None
    assert profile.is_self is False
    assert profile.cards == 2
    assert profile.distinct_cards == 1
    assert profile.spares == 1
    assert profile.you_want == 1
    assert profile.sets[0].set_name == "Base Set"
    assert not hasattr(profile, "value")


async def test_your_own_profile_says_so(
    swappable: AsyncSession, user_id: str
) -> None:
    profile = await trade.collector_profile(swappable, user_id, viewer_id=user_id)

    assert profile is not None
    assert profile.is_self is True


async def test_an_unknown_collector_has_no_profile(
    swappable: AsyncSession, user_id: str
) -> None:
    assert await trade.collector_profile(swappable, "nobody", viewer_id=user_id) is None


async def test_an_unstated_condition_offers_the_worst_copy(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """Nobody parts with the pristine one while a scuffed duplicate sits there."""
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=SQUIRTLE_CARD)
    )
    await collection.add_card(
        catalogued,
        user_id,
        AddCardRequest(card_id=SQUIRTLE_CARD, condition=CardCondition.DAMAGED),
    )
    await collection.add_card(
        catalogued, other_user_id, AddCardRequest(card_id=CHARIZARD_CARD, quantity=2)
    )

    offer = await trade.create_offer(catalogued, user_id, an_offer(other_user_id))
    given = next(entry for entry in offer.cards if entry.card_id == SQUIRTLE_CARD)

    assert given.condition is CardCondition.DAMAGED


async def test_a_condition_nobody_holds_is_refused(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    with pytest.raises(trade.OfferError, match="No damaged copy"):
        await trade.create_offer(
            swappable,
            user_id,
            CreateOfferRequest(
                to_user_id=other_user_id,
                offered=[card_input(SQUIRTLE_CARD, CardCondition.DAMAGED)],
                requested=[card_input(CHARIZARD_CARD)],
            ),
        )


async def test_condition_discounts_what_the_offer_is_worth(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """A damaged Charizard is not a hundred dollars, and the total has to agree."""
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=SQUIRTLE_CARD, quantity=2)
    )
    await collection.add_card(
        catalogued,
        other_user_id,
        AddCardRequest(
            card_id=CHARIZARD_CARD, quantity=2, condition=CardCondition.DAMAGED
        ),
    )

    offer = await trade.create_offer(catalogued, user_id, an_offer(other_user_id))
    view = next(
        entry
        for entry in await trade.list_offers(catalogued, user_id)
        if entry.id == offer.id
    )

    assert view.you_get[0].condition is CardCondition.DAMAGED
    assert view.you_get[0].price_usd == Decimal("100.00")
    assert view.you_get[0].adjusted_usd == Decimal("35.00")
    assert view.get_value == Decimal("35.00")


WARTORTLE_CARD = f"{SET_ID}-8"


def a_listing(want: list[str] | None = None) -> CreateListingRequest:
    return CreateListingRequest(
        give=[card_input(CHARIZARD_CARD)], want=want or [SQUIRTLE_CARD]
    )


def on_board(
    page: Page[TradeListingView], listing_id: UUID
) -> TradeListingView | None:
    """One listing on the board, if the filter left it there.

    The board is public, so like matching it sees rows the test did not create.
    Assertions name the listing they mean rather than counting the page.
    """
    return next((item for item in page.items if item.id == listing_id), None)


async def test_a_listing_is_addressed_to_nobody(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """Anyone holding what it asks for reads the same listing and the same price."""
    listing = await trade.publish_listing(swappable, other_user_id, a_listing())

    page = await trade.listing_page(swappable, user_id, limit=50)
    view = on_board(page, listing.id)

    assert view is not None
    assert view.is_mine is False
    assert view.owner_id == other_user_id
    assert [entry.card.id for entry in view.gives] == [CHARIZARD_CARD]
    assert [entry.card.id for entry in view.wants] == [SQUIRTLE_CARD]
    assert view.can_fulfil is True
    assert view.available is True
    assert view.balance == Decimal("90.00")


async def test_a_wanted_card_carries_no_condition(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """Which copy arrives is for whoever takes it to say, and nobody has yet."""
    listing = await trade.publish_listing(swappable, other_user_id, a_listing())

    view = on_board(await trade.listing_page(swappable, user_id, limit=50), listing.id)

    assert view is not None
    assert view.gives[0].condition is CardCondition.NEAR_MINT
    assert view.wants[0].condition is None
    assert view.wants[0].adjusted_usd is None
    assert view.want_value == Decimal("10.00")


async def test_a_listing_cannot_promise_a_card_its_publisher_lacks(
    swappable: AsyncSession, user_id: str
) -> None:
    """The unaddressed half of the promise is still a promise."""
    with pytest.raises(trade.ListingError, match="Not spare in your collection"):
        await trade.publish_listing(swappable, user_id, a_listing())


async def test_a_listing_cannot_ask_for_what_it_also_gives(
    swappable: AsyncSession, other_user_id: str
) -> None:
    with pytest.raises(trade.ListingError, match="given at once"):
        await trade.publish_listing(
            swappable, other_user_id, a_listing(want=[CHARIZARD_CARD])
        )


@pytest.fixture
async def a_third_card(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> AsyncSession:
    """A card the reader owns one of and somebody else has spare.

    Spare for somebody is not spare for the reader, and a filter that reads the
    wrong holder's inventory answers yes to both.
    """
    await catalog.upsert_cards(
        swappable, [card(WARTORTLE_CARD, 7, "Wartortle", "8", Decimal("5.00"))]
    )
    await collection.add_card(swappable, user_id, AddCardRequest(card_id=WARTORTLE_CARD))
    await collection.add_card(
        swappable, other_user_id, AddCardRequest(card_id=WARTORTLE_CARD, quantity=2)
    )
    return swappable


async def test_a_listing_cannot_be_taken_without_what_it_asks_for(
    a_third_card: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """The taker's half is checked the same way: one copy is the collection."""
    listing = await trade.publish_listing(
        a_third_card, other_user_id, a_listing(want=[WARTORTLE_CARD])
    )

    view = on_board(
        await trade.listing_page(a_third_card, user_id, limit=50), listing.id
    )
    assert view is not None
    assert view.can_fulfil is False
    assert view.missing == 1

    with pytest.raises(trade.ListingError, match="Not spare in your collection"):
        await trade.accept_listing(a_third_card, user_id, listing.id)


async def test_the_board_cuts_to_what_the_reader_can_fill(
    a_third_card: AsyncSession, user_id: str, other_user_id: str
) -> None:
    fillable = await trade.publish_listing(a_third_card, other_user_id, a_listing())
    unfillable = await trade.publish_listing(
        a_third_card, other_user_id, a_listing(want=[WARTORTLE_CARD])
    )

    page = await trade.listing_page(
        a_third_card, user_id, fulfillable=True, limit=50
    )

    assert on_board(page, fillable.id) is not None
    assert on_board(page, unfillable.id) is None


async def test_the_board_can_be_searched(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    listing = await trade.publish_listing(swappable, other_user_id, a_listing())

    named = await trade.listing_page(swappable, user_id, search="chari", limit=50)
    other = await trade.listing_page(swappable, user_id, search="zzzz", limit=50)

    assert on_board(named, listing.id) is not None
    assert on_board(other, listing.id) is None


async def test_the_board_is_read_a_page_at_a_time(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    for _ in range(3):
        await trade.publish_listing(
            swappable,
            user_id,
            CreateListingRequest(
                give=[card_input(SQUIRTLE_CARD)], want=[CHARIZARD_CARD]
            ),
        )

    first = await trade.listing_page(swappable, user_id, mine=True, limit=2)
    second = await trade.listing_page(swappable, user_id, mine=True, limit=2, offset=2)

    assert first.total == 3
    assert len(first.items) == 2
    assert len(second.items) == 1
    assert all(item.is_mine for item in first.items)


async def test_taking_a_listing_writes_the_trade_both_sides_read(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """The board and the negotiation end in the same record."""
    listing = await trade.publish_listing(swappable, other_user_id, a_listing())

    offer = await trade.accept_listing(swappable, user_id, listing.id)
    assert offer is not None
    assert offer.status is OfferStatus.ACCEPTED

    mine = next(
        entry for entry in await trade.list_offers(swappable, user_id)
        if entry.id == offer.id
    )
    theirs = next(
        entry for entry in await trade.list_offers(swappable, other_user_id)
        if entry.id == offer.id
    )

    assert mine.direction == "received"
    assert [entry.card.id for entry in mine.you_get] == [CHARIZARD_CARD]
    assert [entry.card.id for entry in mine.you_give] == [SQUIRTLE_CARD]
    assert theirs.direction == "sent"
    assert listing.status is ListingStatus.TAKEN
    assert listing.offer_id == offer.id


async def test_taking_a_listing_moves_no_cards(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    before = await collection.total_quantity(swappable, user_id)
    listing = await trade.publish_listing(swappable, other_user_id, a_listing())

    await trade.accept_listing(swappable, user_id, listing.id)

    assert await collection.total_quantity(swappable, user_id) == before


async def test_a_listing_is_taken_once(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """Two collectors cannot both walk away with the same cards."""
    listing = await trade.publish_listing(swappable, other_user_id, a_listing())
    await trade.accept_listing(swappable, user_id, listing.id)

    with pytest.raises(trade.ListingError, match="already taken"):
        await trade.accept_listing(swappable, user_id, listing.id)


async def test_a_listing_claimed_underneath_a_reader_is_refused(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """The row decides who took it, not the copy the reader was holding.

    Somebody else's take lands after this reader has already read the listing as
    open, which is the only way two people ever take the same one.
    """
    listing = await trade.publish_listing(swappable, other_user_id, a_listing())
    await swappable.execute(
        update(TradeListing)
        .where(TradeListing.id == listing.id)
        .values(status=ListingStatus.TAKEN)
        .execution_options(synchronize_session=False)
    )

    with pytest.raises(trade.ListingError, match="already taken"):
        await trade.accept_listing(swappable, user_id, listing.id)


async def test_a_publisher_does_not_take_their_own_listing(
    swappable: AsyncSession, other_user_id: str
) -> None:
    listing = await trade.publish_listing(swappable, other_user_id, a_listing())

    with pytest.raises(trade.ListingError, match="somebody else"):
        await trade.accept_listing(swappable, other_user_id, listing.id)


async def test_only_the_publisher_cancels(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    listing = await trade.publish_listing(swappable, other_user_id, a_listing())

    assert await trade.cancel_listing(swappable, user_id, listing.id) is None

    cancelled = await trade.cancel_listing(swappable, other_user_id, listing.id)
    assert cancelled is not None
    assert cancelled.status is ListingStatus.CANCELLED


async def test_a_cancelled_listing_cannot_be_taken(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    listing = await trade.publish_listing(swappable, other_user_id, a_listing())
    await trade.cancel_listing(swappable, other_user_id, listing.id)

    with pytest.raises(trade.ListingError, match="already cancelled"):
        await trade.accept_listing(swappable, user_id, listing.id)


async def test_a_listing_stops_standing_when_its_publisher_runs_out(
    swappable: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """What somebody had spare last week is not a promise they can still keep."""
    listing = await trade.publish_listing(swappable, other_user_id, a_listing())
    held = await collection.add_card(
        swappable, other_user_id, AddCardRequest(card_id=CHARIZARD_CARD)
    )
    await collection.update_item(
        swappable, other_user_id, held.id, UpdateItemRequest(quantity=1)
    )

    view = on_board(await trade.listing_page(swappable, user_id, limit=50), listing.id)
    assert view is not None
    assert view.available is False

    with pytest.raises(trade.ListingError, match="No longer spare"):
        await trade.accept_listing(swappable, user_id, listing.id)


async def test_spares_publish_the_conditions_on_hand(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await collection.add_card(
        catalogued, other_user_id, AddCardRequest(card_id=CHARIZARD_CARD)
    )
    await collection.add_card(
        catalogued,
        other_user_id,
        AddCardRequest(card_id=CHARIZARD_CARD, condition=CardCondition.HEAVILY_PLAYED),
    )

    page = await trade.spare_page(catalogued, other_user_id, viewer_id=user_id)

    assert [count.condition for count in page.items[0].conditions] == [
        CardCondition.NEAR_MINT,
        CardCondition.HEAVILY_PLAYED,
    ]
