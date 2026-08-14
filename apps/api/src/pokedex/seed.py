"""A generated marketplace of collectors: what the app looks like with users in it.

Only the `pokedex-seed` console script reaches this module. It sits outside
`services/` because nothing the API composes has any business writing users.

Everything descends from one integer seed and every row carries a key derived
from it, so running the command twice writes nothing the second time.
"""

import math
import random
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID, uuid5

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.base import Base
from pokedex.db.models import (
    Card,
    CardCondition,
    CollectionItem,
    ListingStatus,
    OfferSide,
    OfferStatus,
    TradeListing,
    TradeListingCard,
    TradeOffer,
    TradeOfferCard,
    WishlistItem,
    WishlistSource,
    auth_user,
)
from pokedex.services.trade import CONDITION_VALUE

DEFAULT_COUNT = 1000
DEFAULT_SEED = 20260813

# Seeded rows are recognisable by their owner's id, which is what lets --reset
# remove exactly what this command wrote and nothing a real person signed up for.
ID_PREFIX = "seed-"
EMAIL_DOMAIN = "seed.pokedex.test"

# Namespace for the uuid5 keys. Any fixed uuid works; this one was generated once.
KEYS = UUID("6f2b8a1e-0c3d-4f5a-9b7e-2d1c8a4f6e30")

# How many distinct cards a typical collector holds, and how wide the tail is in
# log space. A flat distribution would make every leaderboard read as generated:
# real collections are a crowd of starters around a handful of cards with a few
# people holding half the catalog.
SIZE_MEDIAN = 9.0
SIZE_SIGMA = 1.25

WANT_MEDIAN = 5.0
WANT_SIGMA = 0.9
WANT_MAX = 40

# Collectors mostly buy into one or two sets, which is what makes two of them
# have anything to say to each other. Cards outside the focus still show up.
FOCUS_BOOST = 6.0
TRADER_SHARE = 0.6
TRADER_DUPLICATE = 0.24
KEEPER_DUPLICATE = 0.03
SECOND_CONDITION = 0.05
WANTS_SHARE = 0.75
COST_SHARE = 0.65
GRADED_SHARE = 0.02
GRADED_FLOOR = Decimal(20)

OFFERS_PER_COLLECTOR = 0.125
LISTINGS_PER_COLLECTOR = 0.1
COUNTER_SHARE = 0.25

HISTORY_DAYS = 1095
BOARD_DAYS = 60

CONDITION_MIX: tuple[tuple[CardCondition, float], ...] = (
    (CardCondition.MINT, 0.10),
    (CardCondition.NEAR_MINT, 0.42),
    (CardCondition.LIGHTLY_PLAYED, 0.22),
    (CardCondition.MODERATELY_PLAYED, 0.14),
    (CardCondition.HEAVILY_PLAYED, 0.08),
    (CardCondition.DAMAGED, 0.04),
)

OFFER_MIX: tuple[tuple[OfferStatus, float], ...] = (
    (OfferStatus.PENDING, 0.55),
    (OfferStatus.ACCEPTED, 0.20),
    (OfferStatus.DECLINED, 0.15),
    (OfferStatus.WITHDRAWN, 0.10),
)

LANGUAGES: tuple[tuple[str, float], ...] = (("en", 0.85), ("es", 0.10), ("jp", 0.05))

HANDLE_PREFIXES = (
    "dark", "neo", "pixel", "turbo", "void", "hyper", "lucky", "iron", "ghost",
    "mega", "ultra", "retro", "frost", "toxic", "astro", "rogue", "glitch",
    "nitro", "cosmo", "shiny", "holo", "bulk", "meta", "crit", "chibi", "aqua",
    "volt", "ember", "zen", "noct", "grim", "salt", "prism", "wild",
)
HANDLE_NOUNS = (
    "blaze", "raptor", "gambit", "specter", "nomad", "havoc", "zenith", "quasar",
    "husk", "fang", "drake", "comet", "goblin", "siren", "reaper", "totem",
    "vortex", "warden", "yeti", "onyx", "rune", "saber", "tundra", "viper",
    "wisp", "bolt", "charm", "dojo", "echo", "flux", "grimm", "hydra", "jinx",
    "kraken", "binder", "sleeve", "booster", "topdeck", "mulligan", "combo",
)
HANDLE_SHORTS = ("kuro", "mika", "zed", "nyx", "tao", "rin", "oz", "kai", "vex", "juno", "pip")
HANDLE_TAGS = ("", "", "", "_ttv", "TTV", "_yt", "xd", "hd", "mx", "_es")

# Seeded users write to each other in the language the app speaks.
OFFER_MESSAGES = (
    "Te dejo estas por las que buscas, todas de mi carpeta de repes.",
    "Me interesan mucho, dime si te sirve el cambio.",
    "Tengo repetidas, si quieres te mando fotos antes.",
    "Cambio limpio, las mias estan en fundas desde que salieron.",
    "Si te sobra alguna mas de ese set avisame y ajustamos.",
    "Llevo meses buscando esta, acepto lo que veas justo.",
)
LISTING_NOTES = (
    "Cambio repetidas del set base, solo busco lo de mi lista.",
    "Todo en buen estado, envio a cualquier parte del pais.",
    "Prefiero cambios en mano, pero escucho ofertas.",
    "Suelto repes para completar mi carpeta, no vendo.",
    "Primera que llegue se la lleva.",
)
WANT_REASONS = (
    "Me falta para completar el set.",
    "Para la carpeta de tipo fuego.",
    "La tenia de nino y la perdi.",
    "Ultima que me falta de esa serie.",
)
HOLDING_NOTES = (
    "Comprada en la tienda del centro.",
    "Cambio con un amigo.",
    "Del sobre de cumpleanos.",
    "Lote de segunda mano.",
)

CENTS = Decimal("0.01")
CHUNK = 1000

# Better Auth owns this table, so rows go in with raw SQL rather than a second
# model of it. Its columns are camelCase and `user` is reserved.
_INSERT_USER = text(
    'INSERT INTO auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") '
    "VALUES (:id, :name, :email, true, :created_at, :created_at) ON CONFLICT DO NOTHING"
)
_DELETE_USERS = text('DELETE FROM auth."user" WHERE id LIKE :prefix RETURNING id')


@dataclass(frozen=True, slots=True)
class CardRef:
    id: str
    set_id: str
    price_usd: Decimal | None


@dataclass(frozen=True, slots=True)
class Holding:
    card_id: str
    condition: CardCondition
    language: str
    quantity: int
    is_graded: bool
    grade: Decimal | None
    unit_cost_usd: Decimal | None
    notes: str | None
    acquired_at: date
    created_at: datetime


@dataclass(frozen=True, slots=True)
class Want:
    card_id: str
    priority: int
    added_by: WishlistSource
    reason: str | None
    created_at: datetime


@dataclass(frozen=True, slots=True)
class Collector:
    id: str
    name: str
    email: str
    created_at: datetime
    holdings: tuple[Holding, ...]
    wants: tuple[Want, ...]
    spares: frozenset[str]
    want_ids: frozenset[str]


@dataclass(frozen=True, slots=True)
class OfferCard:
    card_id: str
    side: OfferSide
    condition: CardCondition


@dataclass(frozen=True, slots=True)
class Offer:
    id: UUID
    from_user_id: str
    to_user_id: str
    status: OfferStatus
    message: str | None
    replies_to_id: UUID | None
    created_at: datetime
    responded_at: datetime | None
    cards: tuple[OfferCard, ...]


@dataclass(frozen=True, slots=True)
class ListingCard:
    card_id: str
    side: OfferSide
    condition: CardCondition | None


@dataclass(frozen=True, slots=True)
class Listing:
    id: UUID
    owner_id: str
    status: ListingStatus
    note: str | None
    offer_id: UUID | None
    created_at: datetime
    taken_at: datetime | None
    cards: tuple[ListingCard, ...]


@dataclass(frozen=True, slots=True)
class Market:
    collectors: tuple[Collector, ...]
    offers: tuple[Offer, ...]
    listings: tuple[Listing, ...]


@dataclass(frozen=True, slots=True)
class Counted:
    planned: int
    written: int


@dataclass(frozen=True, slots=True)
class SeedReport:
    collectors: Counted
    holdings: Counted
    wants: Counted
    offers: Counted
    listings: Counted
    removed: int
    sizes: tuple[int, ...]


def _key(kind: str, *parts: object) -> UUID:
    """A row's identity, so writing it twice is writing it once.

    Every key is built from the collector it belongs to, whose own id carries
    the run seed: two runs with different seeds never collide.
    """
    return uuid5(KEYS, ":".join([kind, *(str(part) for part in parts)]))


def _pick[T](rng: random.Random, mix: Sequence[tuple[T, float]]) -> T:
    return rng.choices([value for value, _ in mix], [weight for _, weight in mix])[0]


def _sample(
    rng: random.Random, population: Sequence[CardRef], weights: Sequence[float], size: int
) -> list[CardRef]:
    """Weighted draw without replacement, by Efraimidis-Spirakis keys.

    `random.choices` would hand out the same card twice, and a collection with
    the same card in it twice is one row with a quantity, not two draws.
    """
    if size >= len(population):
        return list(population)

    keys = sorted(
        ((rng.random() ** (1.0 / weight), index) for index, weight in enumerate(weights)),
        reverse=True,
    )
    return [population[index] for _, index in keys[:size]]


def _commonness(card: CardRef) -> float:
    """How widely a card is held. Cheap cards are the ones everybody has."""
    return float(1.0 / (1.0 + float(card.price_usd or 1)) ** 0.6)


def _desirability(card: CardRef) -> float:
    """How badly a card is wanted. Chase cards are the expensive ones."""
    return float((1.0 + float(card.price_usd or 1)) ** 0.5)


def _handle(rng: random.Random) -> str:
    prefix, noun = rng.choice(HANDLE_PREFIXES), rng.choice(HANDLE_NOUNS)
    shape = rng.random()
    if shape < 0.20:
        return f"{prefix.capitalize()}{noun.capitalize()}"
    if shape < 0.40:
        return f"{prefix}_{noun}"
    if shape < 0.58:
        return f"{noun}{rng.randrange(2, 999)}"
    if shape < 0.70:
        return f"{prefix}{noun}{rng.randrange(100):02d}"
    if shape < 0.80:
        short = rng.choice(HANDLE_SHORTS)
        return short if rng.random() < 0.5 else f"{short}{rng.randrange(1, 9)}"
    if shape < 0.88:
        return f"xX_{noun}_Xx"
    return f"{prefix.capitalize()}{noun.capitalize()}{rng.choice(HANDLE_TAGS)}"


def _unique_handle(rng: random.Random, taken: set[str], index: int) -> str:
    for _ in range(20):
        handle = _handle(rng)
        if handle.lower() not in taken:
            taken.add(handle.lower())
            return handle

    handle = f"{_handle(rng)}{index}"
    taken.add(handle.lower())
    return handle


def _money(value: float) -> Decimal:
    return Decimal(value).quantize(CENTS, rounding=ROUND_HALF_UP)


def _holding(
    rng: random.Random, card: CardRef, condition: CardCondition, quantity: int, today: date
) -> Holding:
    acquired = today - timedelta(days=rng.randrange(HISTORY_DAYS))
    graded = (
        card.price_usd is not None
        and card.price_usd >= GRADED_FLOOR
        and rng.random() < GRADED_SHARE
    )
    cost: Decimal | None = None
    if card.price_usd is not None and rng.random() < COST_SHARE:
        cost = max(CENTS, _money(float(card.price_usd) * rng.uniform(0.45, 1.45)))

    return Holding(
        card_id=card.id,
        condition=condition,
        language=_pick(rng, LANGUAGES),
        quantity=quantity,
        is_graded=graded,
        grade=Decimal(rng.choice(["7.0", "8.0", "8.5", "9.0", "9.5", "10.0"])) if graded else None,
        unit_cost_usd=cost,
        notes=rng.choice(HOLDING_NOTES) if rng.random() < 0.08 else None,
        acquired_at=acquired,
        created_at=datetime.combine(acquired, datetime.min.time())
        + timedelta(days=rng.randrange(30), minutes=rng.randrange(1440)),
    )


def _collector(index: int, seed: int, pool: Sequence[CardRef], taken: set[str]) -> Collector:
    """One collector, drawn from a stream of their own.

    Seeding per collector rather than once for the run keeps collector 12 the
    same collector whether the run asked for a hundred of them or a thousand.
    """
    rng = random.Random(f"{seed}:{index}")
    handle = _unique_handle(rng, taken, index)
    today = date.today()

    set_ids = sorted({card.set_id for card in pool})
    roll = rng.random()
    if roll < 0.55:
        focus = {rng.choice(set_ids)}
    elif roll < 0.90:
        focus = set(rng.sample(set_ids, min(2, len(set_ids))))
    else:
        focus = set(set_ids)

    size = min(len(pool), max(1, round(rng.lognormvariate(math.log(SIZE_MEDIAN), SIZE_SIGMA))))
    weights = [
        _commonness(card) * (FOCUS_BOOST if card.set_id in focus else 1.0) for card in pool
    ]
    drawn = _sample(rng, pool, weights, size)

    duplicate = TRADER_DUPLICATE if rng.random() < TRADER_SHARE else KEEPER_DUPLICATE
    holdings: list[Holding] = []
    for card in drawn:
        condition = _pick(rng, CONDITION_MIX)
        quantity = 1
        chance = duplicate if (card.price_usd or 0) < 5 else duplicate * 0.4
        if rng.random() < chance:
            quantity = _pick(rng, ((2, 0.7), (3, 0.2), (4, 0.1)))
        holdings.append(_holding(rng, card, condition, quantity, today))

        if rng.random() < SECOND_CONDITION:
            other = _pick(rng, tuple((c, w) for c, w in CONDITION_MIX if c is not condition))
            holdings.append(_holding(rng, card, other, 1, today))

    owned = {holding.card_id for holding in holdings}
    wants = _wants(rng, pool, focus, owned, today) if rng.random() < WANTS_SHARE else ()

    copies: dict[str, int] = {}
    for holding in holdings:
        copies[holding.card_id] = copies.get(holding.card_id, 0) + holding.quantity

    joined = min(holding.created_at for holding in holdings)
    return Collector(
        id=f"{ID_PREFIX}{seed}-{index:05d}",
        name=handle,
        email=f"{handle.lower()}@{EMAIL_DOMAIN}",
        created_at=joined - timedelta(days=rng.randrange(1, 60)),
        holdings=tuple(holdings),
        wants=wants,
        spares=frozenset(card_id for card_id, total in copies.items() if total > 1),
        want_ids=frozenset(want.card_id for want in wants),
    )


def _wants(
    rng: random.Random,
    pool: Sequence[CardRef],
    focus: set[str],
    owned: set[str],
    today: date,
) -> tuple[Want, ...]:
    """What a collector is missing: mostly the set they are completing, and a
    few chase cards they will probably never land.

    Completion is the larger half on purpose. Wanting only the expensive cards
    would leave the want lists overlapping nobody's spares, and a match needs
    somebody's spare on the other side of it.
    """
    candidates = [card for card in pool if card.id not in owned]
    if not candidates:
        return ()

    size = min(
        len(candidates),
        max(1, min(WANT_MAX, round(rng.lognormvariate(math.log(WANT_MEDIAN), WANT_SIGMA)))),
    )
    chase = round(size * 0.4)

    completion = _sample(
        rng,
        candidates,
        [
            _commonness(card) * (FOCUS_BOOST if card.set_id in focus else 1.0)
            for card in candidates
        ],
        size - chase,
    )
    picked = {card.id for card in completion}
    rest = [card for card in candidates if card.id not in picked]
    wanted = completion + _sample(rng, rest, [_desirability(card) for card in rest], chase)

    return tuple(
        Want(
            card_id=card.id,
            priority=rng.choice([0, 0, 1, 1, 2, 3]),
            added_by=_pick(rng, ((WishlistSource.USER, 0.85), (WishlistSource.AGENT, 0.15))),
            reason=rng.choice(WANT_REASONS) if rng.random() < 0.3 else None,
            created_at=datetime.combine(
                today - timedelta(days=rng.randrange(HISTORY_DAYS)), datetime.min.time()
            ),
        )
        for card in wanted
    )


def _worst(collector: Collector, card_id: str) -> CardCondition:
    """The scruffiest copy somebody holds, which is the one they part with.

    Same rule the trade service applies when an offer names no condition, so a
    seeded offer says what the app would have said.
    """
    order = list(CONDITION_VALUE)
    held = [h.condition for h in collector.holdings if h.card_id == card_id]
    return max(held, key=order.index)


def _offer_cards(
    rng: random.Random, collector: Collector, wanted_by: frozenset[str], limit: int
) -> list[str]:
    """Cards to put on the table: what the other side asked for, first."""
    preferred = sorted(collector.spares & wanted_by)
    rest = sorted(collector.spares - wanted_by)
    rng.shuffle(preferred)
    rng.shuffle(rest)
    chosen = (preferred + rest)[: rng.randint(1, limit)]
    return chosen or sorted(collector.spares)[:1]


def _offers(
    rng: random.Random, seed: int, collectors: Sequence[Collector], today: datetime
) -> list[Offer]:
    traders = [collector for collector in collectors if collector.spares]
    if len(traders) < 2:
        return []

    offers: list[Offer] = []
    for index in range(round(len(collectors) * OFFERS_PER_COLLECTOR)):
        proposer = rng.choice(traders)
        partner = _partner(rng, traders, proposer)
        if partner is None:
            continue

        offered = _offer_cards(rng, proposer, partner.want_ids, 3)
        requested = [
            card_id
            for card_id in _offer_cards(rng, partner, proposer.want_ids, 3)
            if card_id not in offered
        ]
        if not requested:
            continue

        status = _pick(rng, OFFER_MIX)
        created = today - timedelta(days=rng.randrange(BOARD_DAYS), minutes=rng.randrange(1440))
        offers.append(
            Offer(
                id=_key("offer", index, proposer.id, partner.id),
                from_user_id=proposer.id,
                to_user_id=partner.id,
                status=status,
                message=rng.choice(OFFER_MESSAGES) if rng.random() < 0.6 else None,
                replies_to_id=None,
                created_at=created,
                responded_at=(
                    None
                    if status is OfferStatus.PENDING
                    else created + timedelta(hours=rng.randrange(1, 72))
                ),
                cards=tuple(
                    [
                        OfferCard(card_id, OfferSide.OFFERED, _worst(proposer, card_id))
                        for card_id in offered
                    ]
                    + [
                        OfferCard(card_id, OfferSide.REQUESTED, _worst(partner, card_id))
                        for card_id in requested
                    ]
                ),
            )
        )

    return offers + _counters(rng, seed, collectors, offers)


def _partner(
    rng: random.Random, traders: Sequence[Collector], proposer: Collector
) -> Collector | None:
    """Somebody worth writing to: they want a spare of yours and hold one you want.

    Tried a few times and then settled for whoever, because a marketplace where
    every single offer is a perfect two-way fit is not one either.
    """
    fallback: Collector | None = None
    for _ in range(12):
        candidate = rng.choice(traders)
        if candidate.id == proposer.id:
            continue
        fallback = fallback or candidate
        if candidate.want_ids & proposer.spares and candidate.spares & proposer.want_ids:
            return candidate
    return fallback


def _counters(
    rng: random.Random, seed: int, collectors: Sequence[Collector], offers: Sequence[Offer]
) -> list[Offer]:
    """Answers to declined offers, swapping the sides round.

    The reply gives what the original asked for, which is already known to be
    spare in the answering collection: a counter has to hold up to the same rule
    the original did.
    """
    by_id = {collector.id: collector for collector in collectors}
    counters: list[Offer] = []
    for index, original in enumerate(offers):
        if original.status is not OfferStatus.DECLINED or rng.random() > COUNTER_SHARE:
            continue

        author, recipient = by_id[original.to_user_id], by_id[original.from_user_id]
        offered = [card.card_id for card in original.cards if card.side is OfferSide.REQUESTED]
        requested = [card.card_id for card in original.cards if card.side is OfferSide.OFFERED][:1]
        created = (original.responded_at or original.created_at) + timedelta(
            hours=rng.randrange(1, 48)
        )
        counters.append(
            Offer(
                id=_key("counter", index, author.id),
                from_user_id=author.id,
                to_user_id=recipient.id,
                status=OfferStatus.PENDING,
                message=rng.choice(OFFER_MESSAGES),
                replies_to_id=original.id,
                created_at=created,
                responded_at=None,
                cards=tuple(
                    [
                        OfferCard(card_id, OfferSide.OFFERED, _worst(author, card_id))
                        for card_id in offered
                    ]
                    + [
                        OfferCard(card_id, OfferSide.REQUESTED, _worst(recipient, card_id))
                        for card_id in requested
                    ]
                ),
            )
        )

    return counters


def _listings(
    rng: random.Random, seed: int, collectors: Sequence[Collector], today: datetime
) -> tuple[list[Listing], list[Offer]]:
    """The open board, plus the offers the taken ones turned into."""
    traders = [collector for collector in collectors if collector.spares]
    if len(traders) < 2:
        return [], []

    board = sorted({card_id for collector in traders for card_id in collector.spares})
    listings: list[Listing] = []
    offers: list[Offer] = []
    for index in range(round(len(collectors) * LISTINGS_PER_COLLECTOR)):
        owner = rng.choice(traders)
        given = sorted(owner.spares)
        rng.shuffle(given)
        given = given[: rng.randint(1, 2)]

        status = _pick(
            rng,
            (
                (ListingStatus.OPEN, 0.70),
                (ListingStatus.CANCELLED, 0.15),
                (ListingStatus.TAKEN, 0.15),
            ),
        )
        taker = _partner(rng, traders, owner) if status is ListingStatus.TAKEN else None
        # A taken listing asks for exactly what the taker had spare, because that
        # is the only listing `accept_listing` would ever have let them take.
        if taker is not None:
            source = sorted(taker.spares - set(given))
        else:
            source = sorted(owner.want_ids - set(given)) or [
                card_id for card_id in board if card_id not in given
            ]
        rng.shuffle(source)
        wanted = source[: rng.randint(1, 2)]
        if not wanted:
            continue

        created = today - timedelta(days=rng.randrange(BOARD_DAYS), minutes=rng.randrange(1440))
        taken_at = (
            created + timedelta(hours=rng.randrange(1, 96))
            if status is ListingStatus.TAKEN
            else None
        )
        offer_id: UUID | None = None
        if taker is not None and taken_at is not None:
            offer_id = _key("listing-offer", index, owner.id)
            offers.append(
                Offer(
                    id=offer_id,
                    from_user_id=owner.id,
                    to_user_id=taker.id,
                    status=OfferStatus.ACCEPTED,
                    message=None,
                    replies_to_id=None,
                    created_at=taken_at,
                    responded_at=taken_at,
                    cards=tuple(
                        [
                            OfferCard(card_id, OfferSide.OFFERED, _worst(owner, card_id))
                            for card_id in given
                        ]
                        + [
                            OfferCard(card_id, OfferSide.REQUESTED, _worst(taker, card_id))
                            for card_id in wanted
                        ]
                    ),
                )
            )

        listings.append(
            Listing(
                id=_key("listing", index, owner.id),
                owner_id=owner.id,
                status=status,
                note=rng.choice(LISTING_NOTES) if rng.random() < 0.7 else None,
                offer_id=offer_id,
                created_at=created,
                taken_at=taken_at,
                cards=tuple(
                    [
                        ListingCard(card_id, OfferSide.OFFERED, _worst(owner, card_id))
                        for card_id in given
                    ]
                    + [ListingCard(card_id, OfferSide.REQUESTED, None) for card_id in wanted]
                ),
            )
        )

    return listings, offers


def plan_market(pool: Sequence[CardRef], *, count: int, seed: int = DEFAULT_SEED) -> Market:
    """Build the whole marketplace in memory, writing nothing."""
    if not pool:
        raise ValueError("The catalog is empty; run pokedex-sync first")

    taken: set[str] = set()
    collectors = tuple(_collector(index, seed, pool, taken) for index in range(count))

    rng = random.Random(f"{seed}:market")
    today = datetime.combine(date.today(), datetime.min.time())
    listings, taken_offers = _listings(rng, seed, collectors, today)

    return Market(
        collectors=collectors,
        offers=tuple(_offers(rng, seed, collectors, today) + taken_offers),
        listings=tuple(listings),
    )


async def load_pool(db: AsyncSession, limit: int | None = None) -> list[CardRef]:
    """The cards collectors draw from, in a fixed order so a limit is repeatable."""
    statement = select(Card.id, Card.set_id, Card.price_usd).order_by(Card.set_id, Card.id)
    if limit is not None:
        statement = statement.limit(limit)

    return [
        CardRef(id=row[0], set_id=row[1], price_usd=row[2])
        for row in (await db.execute(statement)).all()
    ]


async def _insert(db: AsyncSession, model: type[Base], rows: Sequence[dict[str, Any]]) -> None:
    for start in range(0, len(rows), CHUNK):
        await db.execute(
            insert(model).values(list(rows[start : start + CHUNK])).on_conflict_do_nothing()
        )


async def _count(db: AsyncSession, source: Any, column: Any, ids: Sequence[str]) -> int:
    total = 0
    for start in range(0, len(ids), CHUNK):
        chunk = ids[start : start + CHUNK]
        total += (
            await db.execute(
                select(func.count()).select_from(source).where(column.in_(chunk))
            )
        ).scalar_one()
    return total


async def reset(db: AsyncSession) -> int:
    """Remove everything a previous seed wrote. Never touches anyone else."""
    removed = await db.execute(_DELETE_USERS, {"prefix": f"{ID_PREFIX}%"})
    return len(removed.all())


async def write_market(db: AsyncSession, market: Market) -> SeedReport:
    """Write the plan. Every row is keyed, so a second run inserts nothing.

    The caller commits: this leaves the session where it found it.
    """
    ids = [collector.id for collector in market.collectors]
    before = (
        await _count(db, auth_user, auth_user.c.id, ids),
        await _count(db, CollectionItem, CollectionItem.user_id, ids),
        await _count(db, WishlistItem, WishlistItem.user_id, ids),
        await _count(db, TradeOffer, TradeOffer.from_user_id, ids),
        await _count(db, TradeListing, TradeListing.owner_id, ids),
    )

    for start in range(0, len(market.collectors), CHUNK):
        await db.execute(
            _INSERT_USER,
            [
                {
                    "id": collector.id,
                    "name": collector.name,
                    "email": collector.email,
                    "created_at": collector.created_at,
                }
                for collector in market.collectors[start : start + CHUNK]
            ],
        )

    await _insert(
        db,
        CollectionItem,
        [
            {
                "id": _key("holding", collector.id, holding.card_id, holding.condition.value),
                "user_id": collector.id,
                "card_id": holding.card_id,
                "condition": holding.condition,
                "language": holding.language,
                "is_graded": holding.is_graded,
                "grade": holding.grade,
                "quantity": holding.quantity,
                "notes": holding.notes,
                "acquired_at": holding.acquired_at,
                "unit_cost_usd": holding.unit_cost_usd,
                "created_at": holding.created_at,
                "updated_at": holding.created_at,
            }
            for collector in market.collectors
            for holding in collector.holdings
        ],
    )
    await _insert(
        db,
        WishlistItem,
        [
            {
                "id": _key("want", collector.id, want.card_id),
                "user_id": collector.id,
                "card_id": want.card_id,
                "priority": want.priority,
                "reason": want.reason,
                "added_by": want.added_by,
                "created_at": want.created_at,
            }
            for collector in market.collectors
            for want in collector.wants
        ],
    )

    # Answers go in after the offers they answer: the reply points at its
    # original with a foreign key, and chunking can put them in separate rounds.
    for replies in (False, True):
        offers = [
            offer for offer in market.offers if (offer.replies_to_id is not None) is replies
        ]
        await _insert(
            db,
            TradeOffer,
            [
                {
                    "id": offer.id,
                    "from_user_id": offer.from_user_id,
                    "to_user_id": offer.to_user_id,
                    "status": offer.status,
                    "message": offer.message,
                    "replies_to_id": offer.replies_to_id,
                    "created_at": offer.created_at,
                    "responded_at": offer.responded_at,
                }
                for offer in offers
            ],
        )

    await _insert(
        db,
        TradeOfferCard,
        [
            {
                "id": _key("offer-card", offer.id, card.card_id, card.side.value),
                "offer_id": offer.id,
                "card_id": card.card_id,
                "side": card.side,
                "condition": card.condition,
            }
            for offer in market.offers
            for card in offer.cards
        ],
    )
    await _insert(
        db,
        TradeListing,
        [
            {
                "id": listing.id,
                "owner_id": listing.owner_id,
                "status": listing.status,
                "note": listing.note,
                "offer_id": listing.offer_id,
                "created_at": listing.created_at,
                "taken_at": listing.taken_at,
            }
            for listing in market.listings
        ],
    )
    await _insert(
        db,
        TradeListingCard,
        [
            {
                "id": _key("listing-card", listing.id, card.card_id, card.side.value),
                "listing_id": listing.id,
                "card_id": card.card_id,
                "side": card.side,
                "condition": card.condition,
            }
            for listing in market.listings
            for card in listing.cards
        ],
    )

    after = (
        await _count(db, auth_user, auth_user.c.id, ids),
        await _count(db, CollectionItem, CollectionItem.user_id, ids),
        await _count(db, WishlistItem, WishlistItem.user_id, ids),
        await _count(db, TradeOffer, TradeOffer.from_user_id, ids),
        await _count(db, TradeListing, TradeListing.owner_id, ids),
    )
    planned = (
        len(market.collectors),
        sum(len(collector.holdings) for collector in market.collectors),
        sum(len(collector.wants) for collector in market.collectors),
        len(market.offers),
        len(market.listings),
    )
    counted = [
        Counted(planned[index], after[index] - before[index]) for index in range(len(planned))
    ]

    return SeedReport(
        collectors=counted[0],
        holdings=counted[1],
        wants=counted[2],
        offers=counted[3],
        listings=counted[4],
        removed=0,
        sizes=collection_sizes(market),
    )


def collection_sizes(market: Market) -> tuple[int, ...]:
    """Distinct cards per collector, ascending, which is the shape of the tail."""
    return tuple(
        sorted(
            len({holding.card_id for holding in collector.holdings})
            for collector in market.collectors
        )
    )


def percentile(values: Sequence[int], fraction: float) -> int:
    if not values:
        return 0
    return values[min(len(values) - 1, int(len(values) * fraction))]


async def seed_market(
    db: AsyncSession,
    *,
    count: int = DEFAULT_COUNT,
    cards: int | None = None,
    seed: int = DEFAULT_SEED,
    clear: bool = False,
) -> SeedReport:
    removed = await reset(db) if clear else 0
    market = plan_market(await load_pool(db, cards), count=count, seed=seed)

    return replace(await write_market(db, market), removed=removed)


def summary(report: SeedReport) -> str:
    rows = (
        ("collectors", report.collectors),
        ("holdings", report.holdings),
        ("wants", report.wants),
        ("offers", report.offers),
        ("listings", report.listings),
    )
    lines = [
        f"  {label:<12}{counted.planned:>8} planned{counted.written:>8} new"
        for label, counted in rows
    ]
    sizes = report.sizes
    lines.append(
        f"  collection size: min {sizes[0]}, median {percentile(sizes, 0.5)}, "
        f"p90 {percentile(sizes, 0.9)}, max {sizes[-1]}"
    )
    if report.removed:
        lines.insert(0, f"  removed {report.removed} previously seeded collectors")

    return "\n".join(lines)
