from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import CardPrice, WishlistSource
from pokedex.integrations.pokeapi import SpeciesPayload
from pokedex.integrations.tcgdex import CardPayload, SetPayload
from pokedex.schemas.collection import AddCardRequest
from pokedex.schemas.gaps import AddWishlistRequest
from pokedex.schemas.trade import CreateListingRequest, CreateOfferRequest, OfferCardInput
from pokedex.services import catalog, collection, news, preferences, trade, wishlist

SET_ID = "t-news"
CHARIZARD_CARD = "t-news-4"
SQUIRTLE_CARD = "t-news-63"

CHARIZARD = SpeciesPayload(
    id=6,
    name="charizard",
    generation=1,
    types=["fire"],
    stats={"hp": 78},
    evolution_chain_id=2,
    sprite_url=None,
)
NEWS_SET = SetPayload(
    id=SET_ID,
    name="Novedades",
    series="Test",
    printed_total=102,
    total=102,
    release_date=date(1999, 1, 9),
    logo_url=None,
    symbol_url=None,
    card_ids=[],
)


def card(card_id: str, name: str, number: str) -> CardPayload:
    return CardPayload(
        id=card_id,
        set_id=SET_ID,
        species_id=6,
        category="Pokemon",
        number=number,
        number_prefix=number,
        name=name,
        name_normalized=name.lower(),
        rarity="Rare",
        variants={},
        hp=120,
        image_small_url=None,
        image_large_url=None,
        price_usd=Decimal("100.00"),
    )


@pytest.fixture
async def catalogued(db: AsyncSession) -> AsyncSession:
    await catalog.upsert_species(db, [CHARIZARD])
    await catalog.upsert_sets(db, [NEWS_SET])
    await catalog.upsert_cards(
        db,
        [card(CHARIZARD_CARD, "Charizard", "4"), card(SQUIRTLE_CARD, "Squirtle", "63")],
    )
    return db


async def price_on(db: AsyncSession, card_id: str, day: date, amount: str) -> None:
    db.add(CardPrice(card_id=card_id, recorded_on=day, price_usd=Decimal(amount)))
    await db.flush()


async def test_an_offer_you_have_not_answered_is_waiting(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await collection.add_card(
        catalogued, other_user_id, AddCardRequest(card_id=CHARIZARD_CARD, quantity=2)
    )
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=SQUIRTLE_CARD, quantity=2)
    )
    await trade.create_offer(
        catalogued,
        other_user_id,
        CreateOfferRequest(
            to_user_id=user_id,
            offered=[OfferCardInput(card_id=CHARIZARD_CARD)],
            requested=[OfferCardInput(card_id=SQUIRTLE_CARD)],
        ),
    )

    feed = await news.feed(catalogued, user_id)

    waiting = [entry for entry in feed.items if entry.kind == "offer_waiting"]
    assert len(waiting) == 1
    assert waiting[0].partner_id == other_user_id
    assert waiting[0].actionable is True
    assert feed.waiting == 1


async def test_your_own_offer_is_not_something_you_must_answer(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """The badge counts tasks, and an offer you sent is the other side's."""
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=CHARIZARD_CARD, quantity=2)
    )
    await collection.add_card(
        catalogued, other_user_id, AddCardRequest(card_id=SQUIRTLE_CARD, quantity=2)
    )
    await trade.create_offer(
        catalogued,
        user_id,
        CreateOfferRequest(
            to_user_id=other_user_id,
            offered=[OfferCardInput(card_id=CHARIZARD_CARD)],
            requested=[OfferCardInput(card_id=SQUIRTLE_CARD)],
        ),
    )

    feed = await news.feed(catalogued, user_id)

    assert feed.waiting == 0
    assert [entry for entry in feed.items if entry.kind == "offer_waiting"] == []


async def test_a_card_you_want_that_got_cheaper_is_news(
    catalogued: AsyncSession, user_id: str
) -> None:
    await catalogued.execute(delete(CardPrice).where(CardPrice.card_id == CHARIZARD_CARD))
    await wishlist.add(
        catalogued, user_id, AddWishlistRequest(card_id=CHARIZARD_CARD), WishlistSource.USER
    )
    await price_on(catalogued, CHARIZARD_CARD, date.today() - timedelta(days=2), "120.00")
    await price_on(catalogued, CHARIZARD_CARD, date.today(), "90.00")

    feed = await news.feed(catalogued, user_id)

    moved = [entry for entry in feed.items if entry.card_id == CHARIZARD_CARD]
    assert len(moved) == 1
    assert moved[0].kind == "wish_cheaper"
    assert moved[0].amount == Decimal("-30.00")
    # News, not a task: nothing to answer.
    assert feed.waiting == 0


async def test_a_card_you_already_own_is_not_a_price_alert(
    catalogued: AsyncSession, user_id: str
) -> None:
    """A want list keeps the entry after the card is bought, and an alert on a
    card already in hand is noise."""
    await catalogued.execute(delete(CardPrice).where(CardPrice.card_id == CHARIZARD_CARD))
    await wishlist.add(
        catalogued, user_id, AddWishlistRequest(card_id=CHARIZARD_CARD), WishlistSource.USER
    )
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=CHARIZARD_CARD, quantity=1)
    )
    await price_on(catalogued, CHARIZARD_CARD, date.today() - timedelta(days=2), "120.00")
    await price_on(catalogued, CHARIZARD_CARD, date.today(), "90.00")

    feed = await news.feed(catalogued, user_id)

    assert [entry for entry in feed.items if entry.card_id == CHARIZARD_CARD] == []


async def test_a_price_that_did_not_move_is_not_news(
    catalogued: AsyncSession, user_id: str
) -> None:
    await catalogued.execute(delete(CardPrice).where(CardPrice.card_id == CHARIZARD_CARD))
    await wishlist.add(
        catalogued, user_id, AddWishlistRequest(card_id=CHARIZARD_CARD), WishlistSource.USER
    )
    await price_on(catalogued, CHARIZARD_CARD, date.today() - timedelta(days=2), "100.00")
    await price_on(catalogued, CHARIZARD_CARD, date.today(), "100.00")

    feed = await news.feed(catalogued, user_id)

    assert [entry for entry in feed.items if entry.card_id == CHARIZARD_CARD] == []


async def test_what_you_have_already_read_stops_counting(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await collection.add_card(
        catalogued, other_user_id, AddCardRequest(card_id=CHARIZARD_CARD, quantity=2)
    )
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=SQUIRTLE_CARD, quantity=2)
    )
    await trade.create_offer(
        catalogued,
        other_user_id,
        CreateOfferRequest(
            to_user_id=user_id,
            offered=[OfferCardInput(card_id=CHARIZARD_CARD)],
            requested=[OfferCardInput(card_id=SQUIRTLE_CARD)],
        ),
    )
    assert (await news.feed(catalogued, user_id)).waiting == 1

    await news.mark_seen(catalogued, user_id)

    feed = await news.feed(catalogued, user_id)
    assert feed.waiting == 0
    assert all(entry.seen for entry in feed.items)
    # Still there to read: seen is not gone.
    assert feed.total == 1


async def test_every_entry_says_which_clock_it_is_from(
    catalogued: AsyncSession, user_id: str
) -> None:
    """The reader's browser renders these as a time of day, and a naive stamp
    lands on whatever offset the browser happens to have."""
    await catalogued.execute(delete(CardPrice).where(CardPrice.card_id == CHARIZARD_CARD))
    await wishlist.add(
        catalogued, user_id, AddWishlistRequest(card_id=CHARIZARD_CARD), WishlistSource.USER
    )
    await price_on(catalogued, CHARIZARD_CARD, date.today() - timedelta(days=2), "120.00")
    await price_on(catalogued, CHARIZARD_CARD, date.today(), "90.00")

    feed = await news.feed(catalogued, user_id)

    assert feed.items
    assert all(entry.at.tzinfo is not None for entry in feed.items)


async def test_a_marker_is_not_something_the_assistant_remembers_about_you(
    catalogued: AsyncSession, user_id: str
) -> None:
    await news.mark_seen(catalogued, user_id)

    assert await preferences.list_all(catalogued, user_id) == []
    assert await preferences.forget(catalogued, user_id, preferences.NOTIFICATIONS_SEEN_AT) is False


async def test_an_offer_you_accepted_is_a_closed_trade(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await collection.add_card(
        catalogued, other_user_id, AddCardRequest(card_id=CHARIZARD_CARD, quantity=2)
    )
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=SQUIRTLE_CARD, quantity=2)
    )
    offer = await trade.create_offer(
        catalogued,
        other_user_id,
        CreateOfferRequest(
            to_user_id=user_id,
            offered=[OfferCardInput(card_id=CHARIZARD_CARD)],
            requested=[OfferCardInput(card_id=SQUIRTLE_CARD)],
        ),
    )
    await trade.respond_to_offer(catalogued, user_id, offer.id, accept=True)

    feed = await news.feed(catalogued, user_id)

    closed = [entry for entry in feed.items if entry.kind == "trade_closed"]
    assert len(closed) == 1
    assert closed[0].partner_id == other_user_id
    assert [entry for entry in feed.items if entry.kind == "offer_waiting"] == []


async def test_a_listing_of_yours_that_was_taken_is_not_an_answer_to_an_offer(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    """Taking a listing writes an accepted offer from its publisher, and the
    publisher never made one."""
    await collection.add_card(
        catalogued, user_id, AddCardRequest(card_id=CHARIZARD_CARD, quantity=2)
    )
    await collection.add_card(
        catalogued, other_user_id, AddCardRequest(card_id=SQUIRTLE_CARD, quantity=2)
    )
    listing = await trade.publish_listing(
        catalogued,
        user_id,
        CreateListingRequest(
            give=[OfferCardInput(card_id=CHARIZARD_CARD)],
            want=[SQUIRTLE_CARD],
        ),
    )
    await trade.accept_listing(catalogued, other_user_id, listing.id)

    feed = await news.feed(catalogued, user_id)

    taken = [entry for entry in feed.items if entry.kind == "listing_taken"]
    assert len(taken) == 1
    assert taken[0].partner_id == other_user_id
    assert [entry for entry in feed.items if entry.kind == "offer_answered"] == []


async def test_the_feed_is_paged(catalogued: AsyncSession, user_id: str) -> None:
    await catalogued.execute(delete(CardPrice))
    for card_id in (CHARIZARD_CARD, SQUIRTLE_CARD):
        await wishlist.add(
            catalogued, user_id, AddWishlistRequest(card_id=card_id), WishlistSource.USER
        )
        await price_on(catalogued, card_id, date.today() - timedelta(days=2), "120.00")
        await price_on(catalogued, card_id, date.today(), "90.00")

    first = await news.feed(catalogued, user_id, limit=1)
    second = await news.feed(catalogued, user_id, limit=1, offset=1)

    assert first.total == second.total == 2
    assert len(first.items) == len(second.items) == 1
    assert first.items[0].card_id != second.items[0].card_id


async def test_the_filter_keeps_only_what_you_can_act_on(
    catalogued: AsyncSession, user_id: str
) -> None:
    await catalogued.execute(delete(CardPrice))
    await wishlist.add(
        catalogued, user_id, AddWishlistRequest(card_id=CHARIZARD_CARD), WishlistSource.USER
    )
    await price_on(catalogued, CHARIZARD_CARD, date.today() - timedelta(days=2), "90.00")
    await price_on(catalogued, CHARIZARD_CARD, date.today(), "120.00")

    everything = await news.feed(catalogued, user_id)
    tasks = await news.feed(catalogued, user_id, actionable_only=True)

    assert [entry.kind for entry in everything.items] == ["wish_dearer"]
    assert tasks.total == 0


async def test_someone_elses_want_list_is_not_yours(
    catalogued: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await catalogued.execute(delete(CardPrice).where(CardPrice.card_id == CHARIZARD_CARD))
    await wishlist.add(
        catalogued,
        other_user_id,
        AddWishlistRequest(card_id=CHARIZARD_CARD),
        WishlistSource.USER,
    )
    await price_on(catalogued, CHARIZARD_CARD, date.today() - timedelta(days=2), "120.00")
    await price_on(catalogued, CHARIZARD_CARD, date.today(), "90.00")

    feed = await news.feed(catalogued, user_id)

    assert [entry for entry in feed.items if entry.card_id == CHARIZARD_CARD] == []
