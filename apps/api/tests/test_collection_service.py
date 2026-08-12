from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import CardCondition
from pokedex.integrations.pokeapi import SpeciesPayload
from pokedex.integrations.tcgdex import CardPayload, SetPayload
from pokedex.schemas.collection import (
    AddCardRequest,
    CollectionFilters,
    UpdateItemRequest,
)
from pokedex.services import catalog, collection

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
    id="base1",
    name="Base Set",
    series="Base",
    printed_total=102,
    total=102,
    release_date=date(1999, 1, 9),
    logo_url=None,
    symbol_url=None,
    card_ids=[],
)


def card(card_id: str, species_id: int, name: str, number: str) -> CardPayload:
    return CardPayload(
        id=card_id,
        set_id="base1",
        species_id=species_id,
        category="Pokemon",
        number=number,
        number_prefix=number,
        name=name,
        name_normalized=name.lower(),
        rarity="Rare",
        variants={"holo": True},
        hp=120,
        image_small_url=None,
        image_large_url=None,
    )


CHARIZARD_CARD = card("base1-4", 6, "Charizard", "4")
SQUIRTLE_CARD = card("base1-63", 7, "Squirtle", "63")


@pytest.fixture
async def seeded(db: AsyncSession) -> AsyncSession:
    await catalog.upsert_species(db, [CHARIZARD, SQUIRTLE])
    await catalog.upsert_sets(db, [BASE_SET])
    await catalog.upsert_cards(db, [CHARIZARD_CARD, SQUIRTLE_CARD])
    return db


async def test_add_card_creates_a_group(seeded: AsyncSession, user_id: str) -> None:
    item = await collection.add_card(seeded, user_id, AddCardRequest(card_id="base1-4"))

    assert item.quantity == 1
    assert item.condition == CardCondition.NEAR_MINT
    assert await collection.total_quantity(seeded, user_id) == 1


async def test_adding_the_same_ungraded_card_increments_quantity(
    seeded: AsyncSession, user_id: str
) -> None:
    """The regression that motivated NULLS NOT DISTINCT on uq_collection_item_group.

    `grade` is NULL for ungraded cards, and Postgres treats NULLs as distinct by
    default, so without it this produced two rows instead of one of quantity 2.
    """
    await collection.add_card(seeded, user_id, AddCardRequest(card_id="base1-4"))
    await collection.add_card(
        seeded, user_id, AddCardRequest(card_id="base1-4", quantity=2)
    )

    items = await collection.list_items(seeded, user_id, CollectionFilters())
    assert len(items) == 1
    assert items[0].quantity == 3


async def test_different_conditions_stay_separate(
    seeded: AsyncSession, user_id: str
) -> None:
    await collection.add_card(seeded, user_id, AddCardRequest(card_id="base1-4"))
    await collection.add_card(
        seeded,
        user_id,
        AddCardRequest(card_id="base1-4", condition=CardCondition.DAMAGED),
    )

    items = await collection.list_items(seeded, user_id, CollectionFilters())
    assert len(items) == 2
    assert {item.condition for item in items} == {
        CardCondition.NEAR_MINT,
        CardCondition.DAMAGED,
    }


async def test_add_card_rejects_unknown_card(
    seeded: AsyncSession, user_id: str
) -> None:
    with pytest.raises(collection.CardNotFoundError):
        await collection.add_card(seeded, user_id, AddCardRequest(card_id="nope-1"))


async def test_collections_are_isolated_per_user(
    seeded: AsyncSession, user_id: str, other_user_id: str
) -> None:
    await collection.add_card(seeded, user_id, AddCardRequest(card_id="base1-4"))

    assert len(await collection.list_items(seeded, user_id, CollectionFilters())) == 1
    assert (
        len(await collection.list_items(seeded, other_user_id, CollectionFilters())) == 0
    )


@pytest.mark.parametrize(
    ("filters", "expected"),
    [
        (CollectionFilters(type="fire"), {"base1-4"}),
        (CollectionFilters(type="water"), {"base1-63"}),
        (CollectionFilters(generation=1), {"base1-4", "base1-63"}),
        (CollectionFilters(generation=2), set()),
        (CollectionFilters(set_id="base1"), {"base1-4", "base1-63"}),
        (CollectionFilters(search="chari"), {"base1-4"}),
        (CollectionFilters(condition=CardCondition.DAMAGED), set()),
    ],
)
async def test_list_items_filters(
    seeded: AsyncSession,
    user_id: str,
    filters: CollectionFilters,
    expected: set[str],
) -> None:
    await collection.add_card(seeded, user_id, AddCardRequest(card_id="base1-4"))
    await collection.add_card(seeded, user_id, AddCardRequest(card_id="base1-63"))

    items = await collection.list_items(seeded, user_id, filters)
    assert {item.card_id for item in items} == expected


async def test_list_items_joins_both_layers(
    seeded: AsyncSession, user_id: str
) -> None:
    await collection.add_card(seeded, user_id, AddCardRequest(card_id="base1-4"))

    item = (await collection.list_items(seeded, user_id, CollectionFilters()))[0]
    assert item.card.card_set.name == "Base Set"
    assert item.card.species is not None
    assert item.card.species.types == ["fire", "flying"]


async def test_update_item_changes_only_supplied_fields(
    seeded: AsyncSession, user_id: str
) -> None:
    item = await collection.add_card(
        seeded, user_id, AddCardRequest(card_id="base1-4", notes="del abuelo")
    )

    updated = await collection.update_item(
        seeded, user_id, item.id, UpdateItemRequest(quantity=5)
    )

    assert updated is not None
    assert updated.quantity == 5
    assert updated.notes == "del abuelo"


async def test_update_item_refuses_another_users_row(
    seeded: AsyncSession, user_id: str, other_user_id: str
) -> None:
    item = await collection.add_card(seeded, user_id, AddCardRequest(card_id="base1-4"))

    result = await collection.update_item(
        seeded, other_user_id, item.id, UpdateItemRequest(quantity=99)
    )

    assert result is None


async def test_remove_item_is_scoped_to_its_owner(
    seeded: AsyncSession, user_id: str, other_user_id: str
) -> None:
    item = await collection.add_card(seeded, user_id, AddCardRequest(card_id="base1-4"))

    assert await collection.remove_item(seeded, other_user_id, item.id) is False
    assert await collection.remove_item(seeded, user_id, item.id) is True
    assert await collection.get_item(seeded, user_id, item.id) is None


async def test_remove_item_reports_missing_rows(
    seeded: AsyncSession, user_id: str
) -> None:
    assert await collection.remove_item(seeded, user_id, uuid4()) is False


async def test_count_items_respects_filters(
    seeded: AsyncSession, user_id: str
) -> None:
    await collection.add_card(
        seeded, user_id, AddCardRequest(card_id="base1-4", quantity=3)
    )
    await collection.add_card(seeded, user_id, AddCardRequest(card_id="base1-63"))

    assert await collection.count_items(seeded, user_id, CollectionFilters()) == 2
    assert (
        await collection.count_items(seeded, user_id, CollectionFilters(type="fire")) == 1
    )
    assert await collection.total_quantity(seeded, user_id) == 4



@pytest.fixture
async def sortable(db: AsyncSession, user_id: str) -> AsyncSession:
    """Three cards whose orderings all differ, so each sort proves something."""
    await catalog.upsert_species(db, [CHARIZARD, SQUIRTLE])
    await catalog.upsert_sets(db, [BASE_SET])
    await catalog.upsert_cards(
        db,
        [
            CHARIZARD_CARD.model_copy(
                update={"id": "base1-9", "number": "9", "number_prefix": "9",
                        "name": "Zapdos", "name_normalized": "zapdos",
                        "price_usd": Decimal("12.00")}
            ),
            CHARIZARD_CARD.model_copy(
                update={"id": "base1-10", "number": "10", "number_prefix": "10",
                        "name": "Abra", "name_normalized": "abra",
                        "price_usd": Decimal("40.00")}
            ),
            CHARIZARD_CARD.model_copy(
                update={"id": "base1-11", "number": "11", "number_prefix": "11",
                        "name": "Machop", "name_normalized": "machop",
                        "price_usd": None}
            ),
        ],
    )
    for card_id in ("base1-9", "base1-10", "base1-11"):
        await collection.add_card(db, user_id, AddCardRequest(card_id=card_id))
    return db


async def test_sorting_by_name_is_alphabetical(
    sortable: AsyncSession, user_id: str
) -> None:
    items = await collection.list_items(sortable, user_id, CollectionFilters(sort="name"))

    assert [item.card.name for item in items] == ["Abra", "Machop", "Zapdos"]


async def test_sorting_by_number_is_numeric_not_lexical(
    sortable: AsyncSession, user_id: str
) -> None:
    """Collector numbers are text, so "10" would sort before "9" without help."""
    items = await collection.list_items(sortable, user_id, CollectionFilters(sort="number"))

    assert [item.card.number_prefix for item in items] == ["9", "10", "11"]


async def test_sorting_by_price_puts_unpriced_cards_last(
    sortable: AsyncSession, user_id: str
) -> None:
    items = await collection.list_items(sortable, user_id, CollectionFilters(sort="price"))

    assert [item.card.price_usd for item in items] == [
        Decimal("40.00"),
        Decimal("12.00"),
        None,
    ]


async def test_sorting_by_price_ranks_by_position_not_unit_price(
    sortable: AsyncSession, user_id: str
) -> None:
    """Four copies at 12 outweigh one at 40, and the list has to say so."""
    await collection.add_card(
        sortable, user_id, AddCardRequest(card_id="base1-9", quantity=3)
    )

    items = await collection.list_items(sortable, user_id, CollectionFilters(sort="price"))
    values = [
        (item.card.price_usd or 0) * item.quantity
        for item in items
        if item.card.price_usd is not None
    ]

    assert values == sorted(values, reverse=True)
    assert items[0].card.name == "Zapdos"
