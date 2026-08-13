from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import OfferStatus, WishlistSource
from pokedex.integrations.pokeapi import SpeciesPayload
from pokedex.integrations.tcgdex import CardPayload, SetPayload
from pokedex.schemas.collection import AddCardRequest
from pokedex.schemas.gaps import AddWishlistRequest
from pokedex.schemas.trade import CreateOfferRequest, TradeMatch
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
    the database would otherwise decide. For the same reason every call asks for
    more matches than it needs: the default cut would eventually drop the
    counterparty the test is about.
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

    matches = await trade.find_matches(catalogued, user_id, limit=100)
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

    match = with_partner(await trade.find_matches(catalogued, user_id, limit=100), other_user_id)

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

    matches = await trade.find_matches(catalogued, user_id, limit=100)
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

    match = with_partner(await trade.find_matches(catalogued, user_id, limit=100), other_user_id)

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

    match = with_partner(await trade.find_matches(catalogued, user_id, limit=100), other_user_id)
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

    match = with_partner(await trade.find_matches(catalogued, user_id, limit=100), other_user_id)
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

    matches = await trade.find_matches(catalogued, user_id, limit=100)
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


def an_offer(to_user: str) -> CreateOfferRequest:
    return CreateOfferRequest(
        to_user_id=to_user, offered=[SQUIRTLE_CARD], requested=[CHARIZARD_CARD]
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
                offered=[CHARIZARD_CARD],
                requested=[CHARIZARD_CARD],
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
