import random
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex import seed
from pokedex.db.models import (
    CardCondition,
    CollectionItem,
    ListingStatus,
    OfferSide,
    TradeListing,
    TradeOffer,
    WishlistItem,
)
from pokedex.integrations.pokeapi import SpeciesPayload
from pokedex.integrations.tcgdex import CardPayload, SetPayload
from pokedex.services import catalog

COUNT = 1000

PIKACHU = SpeciesPayload(
    id=25,
    name="pikachu",
    generation=1,
    types=["electric"],
    stats={"hp": 35},
    evolution_chain_id=10,
    sprite_url=None,
)


def pool(sets: dict[str, int]) -> list[seed.CardRef]:
    """A catalog shaped like the real one: a few sets, prices skewed to cheap."""
    rng = random.Random(11)
    return [
        seed.CardRef(
            id=f"{set_id}-{number}",
            set_id=set_id,
            price_usd=Decimal(str(round(rng.lognormvariate(0.6, 1.4), 2))),
        )
        for set_id, size in sets.items()
        for number in range(1, size + 1)
    ]


@pytest.fixture(scope="module")
def market() -> seed.Market:
    return seed.plan_market(
        pool({"base1": 102, "base2": 64, "base3": 62, "sv02": 279}), count=COUNT
    )


def test_most_collectors_are_small_and_a_few_are_enormous(market: seed.Market) -> None:
    """A flat distribution would make every leaderboard read as generated."""
    sizes = seed.collection_sizes(market)
    median = seed.percentile(sizes, 0.5)

    assert median <= 15
    assert seed.percentile(sizes, 0.25) <= 5
    assert seed.percentile(sizes, 0.9) >= median * 3
    assert sizes[-1] >= 150


def test_enough_collectors_hold_spares_to_trade_with(market: seed.Market) -> None:
    """Without a second copy of anything there is no trade half of the app."""
    holders = [collector for collector in market.collectors if collector.spares]

    assert 0.4 <= len(holders) / COUNT <= 0.9


def test_want_lists_overlap_what_others_hold_spare(market: seed.Market) -> None:
    """A want nobody has spare is a want that matches nothing."""
    spares = {card_id for collector in market.collectors for card_id in collector.spares}
    wanting = [collector for collector in market.collectors if collector.want_ids]
    wanted = [want.card_id for collector in market.collectors for want in collector.wants]

    assert sum(1 for card_id in wanted if card_id in spares) / len(wanted) >= 0.8
    assert sum(1 for c in wanting if c.want_ids & spares) / len(wanting) >= 0.9


def test_conditions_are_spread_across_the_scale(market: seed.Market) -> None:
    holdings = [holding for collector in market.collectors for holding in collector.holdings]
    counts = {
        condition: sum(1 for holding in holdings if holding.condition is condition)
        for condition in CardCondition
    }

    assert all(count > 0 for count in counts.values())
    assert max(counts.values()) / len(holdings) < 0.6


def test_some_copies_were_bought_at_a_known_price_and_some_were_not(
    market: seed.Market,
) -> None:
    """The portfolio reports what it cannot cost, so the seed has to produce it."""
    holdings = [holding for collector in market.collectors for holding in collector.holdings]
    costed = sum(1 for holding in holdings if holding.unit_cost_usd is not None)

    assert 0 < costed < len(holdings)


def test_offers_only_name_cards_their_owner_has_spare(market: seed.Market) -> None:
    """The rule `create_offer` enforces: a promise nobody can keep is refused."""
    collectors = {collector.id: collector for collector in market.collectors}

    for offer in market.offers:
        proposer, recipient = collectors[offer.from_user_id], collectors[offer.to_user_id]
        assert proposer.id != recipient.id
        for card in offer.cards:
            owner = proposer if card.side is OfferSide.OFFERED else recipient
            assert card.card_id in owner.spares
            held = {h.condition for h in owner.holdings if h.card_id == card.card_id}
            assert card.condition in held


def test_counter_offers_answer_a_declined_offer(market: seed.Market) -> None:
    originals = {offer.id: offer for offer in market.offers}
    counters = [offer for offer in market.offers if offer.replies_to_id is not None]

    assert counters
    for counter in counters:
        original = originals[counter.replies_to_id]
        assert counter.from_user_id == original.to_user_id
        assert counter.to_user_id == original.from_user_id


def test_listings_give_spares_and_never_ask_for_what_they_give(market: seed.Market) -> None:
    collectors = {collector.id: collector for collector in market.collectors}

    assert market.listings
    for listing in market.listings:
        owner = collectors[listing.owner_id]
        gives = {c.card_id for c in listing.cards if c.side is OfferSide.OFFERED}
        wants = {c.card_id for c in listing.cards if c.side is OfferSide.REQUESTED}

        assert gives <= owner.spares
        assert wants and not (gives & wants)


def test_a_taken_listing_carries_the_trade_it_became(market: seed.Market) -> None:
    offers = {offer.id: offer for offer in market.offers}
    taken = [
        listing for listing in market.listings if listing.status is ListingStatus.TAKEN
    ]

    assert taken
    for listing in taken:
        assert listing.taken_at is not None
        offer = offers[listing.offer_id]
        assert offer.from_user_id == listing.owner_id
        assert {c.card_id for c in offer.cards} == {c.card_id for c in listing.cards}


def test_the_board_is_open_for_the_most_part(market: seed.Market) -> None:
    statuses = [listing.status for listing in market.listings]

    assert sum(1 for status in statuses if status is ListingStatus.OPEN) / len(statuses) > 0.5


def test_asking_for_more_collectors_keeps_the_ones_already_there() -> None:
    """Growing the seed adds people rather than rewriting everybody."""
    catalog_pool = pool({"base1": 40})
    small = seed.plan_market(catalog_pool, count=20)
    large = seed.plan_market(catalog_pool, count=60)

    assert large.collectors[:20] == small.collectors


def test_handles_and_emails_are_unique(market: seed.Market) -> None:
    assert len({collector.name for collector in market.collectors}) == COUNT
    assert len({collector.email for collector in market.collectors}) == COUNT


def test_an_empty_catalog_is_refused() -> None:
    with pytest.raises(ValueError):
        seed.plan_market([], count=5)


@pytest.fixture
async def catalogued(db: AsyncSession) -> list[seed.CardRef]:
    await catalog.upsert_species(db, [PIKACHU])
    await catalog.upsert_sets(
        db,
        [
            SetPayload(
                id="seedset",
                name="Seed Set",
                series="Seed",
                printed_total=12,
                total=12,
                release_date=date(1999, 1, 9),
                logo_url=None,
                symbol_url=None,
                card_ids=[],
            )
        ],
    )
    cards = [
        CardPayload(
            id=f"seedset-{number}",
            set_id="seedset",
            species_id=25,
            category="Pokemon",
            number=str(number),
            number_prefix=str(number),
            name=f"Pikachu {number}",
            name_normalized=f"pikachu {number}",
            rarity="Common",
            variants={},
            hp=60,
            image_small_url=None,
            image_large_url=None,
            price_usd=Decimal(number),
        )
        for number in range(1, 13)
    ]
    await catalog.upsert_cards(db, cards)

    return [
        seed.CardRef(id=card.id, set_id=card.set_id, price_usd=card.price_usd) for card in cards
    ]


async def _rows(db: AsyncSession, ids: list[str]) -> tuple[int, int, int, int, int]:
    async def count(model: object, column: object) -> int:
        return (
            await db.execute(select(func.count()).select_from(model).where(column.in_(ids)))  # type: ignore[arg-type]
        ).scalar_one()

    users = (
        await db.execute(
            text('SELECT count(*) FROM auth."user" WHERE id = ANY(:ids)'), {"ids": ids}
        )
    ).scalar_one()
    return (
        users,
        await count(CollectionItem, CollectionItem.user_id),
        await count(WishlistItem, WishlistItem.user_id),
        await count(TradeOffer, TradeOffer.from_user_id),
        await count(TradeListing, TradeListing.owner_id),
    )


async def test_seeding_twice_writes_the_market_once(
    db: AsyncSession, catalogued: list[seed.CardRef]
) -> None:
    """Idempotent by key rather than by refusing to run: a seed that cannot be
    re-run is a seed nobody dares run."""
    market = seed.plan_market(catalogued, count=40, seed=77)
    ids = [collector.id for collector in market.collectors]

    first = await seed.write_market(db, market)
    written = await _rows(db, ids)

    assert first.collectors.written == 40
    assert first.holdings.written == first.holdings.planned > 0
    assert first.offers.written == first.offers.planned > 0

    second = await seed.write_market(db, market)

    assert (second.collectors.written, second.holdings.written, second.wants.written) == (0, 0, 0)
    assert (second.offers.written, second.listings.written) == (0, 0)
    assert await _rows(db, ids) == written


async def test_seeded_collectors_cannot_sign_in(
    db: AsyncSession, catalogued: list[seed.CardRef]
) -> None:
    """They exist to give the marketplace depth, not to be logged into: Better
    Auth owns credential hashing, and none is written for them."""
    market = seed.plan_market(catalogued, count=10, seed=5)
    await seed.write_market(db, market)

    accounts = (
        await db.execute(
            text('SELECT count(*) FROM auth.account WHERE "userId" = ANY(:ids)'),
            {"ids": [collector.id for collector in market.collectors]},
        )
    ).scalar_one()

    assert accounts == 0


async def test_reset_removes_only_seeded_collectors(
    db: AsyncSession, catalogued: list[seed.CardRef], user_id: str
) -> None:
    await seed.write_market(db, seed.plan_market(catalogued, count=10, seed=9))

    await seed.reset(db)

    seeded = (
        await db.execute(
            text("SELECT count(*) FROM auth.\"user\" WHERE id LIKE 'seed-%'")
        )
    ).scalar_one()
    survivor = (
        await db.execute(
            text('SELECT count(*) FROM auth."user" WHERE id = :id'), {"id": user_id}
        )
    ).scalar_one()

    assert (seeded, survivor) == (0, 1)
