from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import WishlistSource
from pokedex.integrations.pokeapi import SpeciesPayload
from pokedex.integrations.tcgdex import CardPayload, SetPayload
from pokedex.schemas.collection import AddCardRequest
from pokedex.schemas.gaps import AddWishlistRequest
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

    assert await trade.find_matches(catalogued, user_id) == []


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

    matches = await trade.find_matches(catalogued, user_id)

    assert len(matches) == 1
    assert matches[0].partner_id == other_user_id
    assert [entry.card.id for entry in matches[0].you_get] == [CHARIZARD_CARD]
    assert [entry.card.id for entry in matches[0].you_give] == [SQUIRTLE_CARD]


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

    assert await trade.find_matches(catalogued, user_id) == []


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

    matches = await trade.find_matches(catalogued, user_id)

    assert matches[0].you_get[0].copies == 3
    assert matches[0].you_give[0].copies == 1


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

    match = (await trade.find_matches(catalogued, user_id))[0]

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

    match = (await trade.find_matches(catalogued, user_id))[0]

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

    assert await trade.find_matches(catalogued, user_id) == []
