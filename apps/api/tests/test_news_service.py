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
from pokedex.schemas.trade import CreateOfferRequest, OfferCardInput
from pokedex.services import catalog, collection, news, trade, wishlist

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

    waiting = [entry for entry in feed.entries if entry.kind == "offer_waiting"]
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
    assert [entry for entry in feed.entries if entry.kind == "offer_waiting"] == []


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

    moved = [entry for entry in feed.entries if entry.card_id == CHARIZARD_CARD]
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

    assert [entry for entry in feed.entries if entry.card_id == CHARIZARD_CARD] == []


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

    assert [entry for entry in feed.entries if entry.card_id == CHARIZARD_CARD] == []


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

    assert [entry for entry in feed.entries if entry.card_id == CHARIZARD_CARD] == []
