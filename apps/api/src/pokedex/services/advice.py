from dataclasses import dataclass
from decimal import Decimal

from pydantic_ai import Agent
from pydantic_ai.settings import ModelSettings
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from pokedex.agent.models import build_model
from pokedex.config import get_settings
from pokedex.db.models import Card, CollectionItem, WishlistItem
from pokedex.schemas.advice import ProposedLeg, TradeAdvice

SYSTEM_PROMPT = """\
You propose one trade for a Pokemon card collector to consider. You do not send it:
it is loaded into a simulator that computes what it would do to their portfolio.

Rules that make a proposal real rather than plausible:
- Give ONLY from the spare list. A spare is a copy beyond the first, so trading one
  never costs them a card they own once.
- Receive ONLY from the wanted list. Those are cards they asked for and do not have.
- Never exceed the spare count of a card.
- Never invent a card id. Every id must appear verbatim in the lists you were given.
- Keep it small: one to three cards a side. A swap nobody would accept is not advice.

Aim for a swap that is close to even in value, or explain plainly why it is not.
Trading a duplicate worth far more than what comes back is a real cost, and saying so
is more useful than hiding it.

The rationale is two sentences of Spanish prose, addressed to the collector. Say what
they give up and what it buys them. Do not list ids. Do not mention these rules.
"""


class AdviceUnavailableError(RuntimeError):
    """No model is configured, so there is nothing honest to answer with."""


@dataclass(frozen=True, slots=True)
class Candidate:
    card_id: str
    name: str
    set_name: str
    price: Decimal | None
    copies: int
    image_url: str | None
    category: str


def _line(candidate: Candidate) -> str:
    price = "sin precio" if candidate.price is None else f"${candidate.price}"
    return (
        f"- {candidate.card_id} | {candidate.name} | {candidate.set_name} "
        f"| {price} | x{candidate.copies}"
    )


async def spare_candidates(db: AsyncSession, user_id: str) -> list[Candidate]:
    spares = (
        select(
            CollectionItem.card_id,
            (func.sum(CollectionItem.quantity) - 1).label("copies"),
        )
        .where(CollectionItem.user_id == user_id)
        .group_by(CollectionItem.card_id)
        .having(func.sum(CollectionItem.quantity) > 1)
        .subquery()
    )

    rows = await db.execute(
        select(Card, spares.c.copies)
        .join(spares, spares.c.card_id == Card.id)
        .options(joinedload(Card.card_set))
        .order_by(Card.price_usd.desc().nullslast())
        .limit(30)
    )
    return [
        Candidate(
            card.id,
            card.name,
            card.card_set.name,
            card.price_usd,
            int(copies),
            card.image_small_url,
            card.category,
        )
        for card, copies in rows.unique().all()
    ]


async def wanted_candidates(db: AsyncSession, user_id: str) -> list[Candidate]:
    held = select(CollectionItem.card_id).where(CollectionItem.user_id == user_id)

    rows = await db.execute(
        select(Card)
        .join(WishlistItem, WishlistItem.card_id == Card.id)
        .options(joinedload(Card.card_set))
        .where(WishlistItem.user_id == user_id, ~Card.id.in_(held))
        .order_by(WishlistItem.priority.desc())
        .limit(30)
    )
    return [
        Candidate(
            card.id,
            card.name,
            card.card_set.name,
            card.price_usd,
            1,
            card.image_small_url,
            card.category,
        )
        for card in rows.unique().scalars().all()
    ]


def _keep(legs: list[ProposedLeg], allowed: dict[str, Candidate]) -> list[ProposedLeg]:
    """Drops anything the model invented or over-counted.

    A proposal is loaded straight into the simulator, which would reject an unknown
    card with an error the reader cannot act on. Silently trimming is wrong too, so
    an empty result is reported as no advice rather than as an empty trade.
    """
    kept: list[ProposedLeg] = []
    for leg in legs:
        candidate = allowed.get(leg.card_id)
        if candidate is None:
            continue
        kept.append(
            ProposedLeg(
                card_id=candidate.card_id,
                card_name=candidate.name,
                set_name=candidate.set_name,
                image_url=candidate.image_url,
                category=candidate.category,
                price_usd=candidate.price,
                owned=candidate.copies,
                quantity=max(1, min(leg.quantity, candidate.copies)),
            )
        )
    return kept


async def propose_trade(db: AsyncSession, user_id: str, goal: str | None) -> TradeAdvice:
    settings = get_settings()
    if not settings.agent_enabled:
        raise AdviceUnavailableError

    spares = await spare_candidates(db, user_id)
    wanted = await wanted_candidates(db, user_id)
    if not spares or not wanted:
        raise LookupError

    agent = Agent(
        build_model(settings.agent_model),
        instructions=SYSTEM_PROMPT,
        output_type=TradeAdvice,
        model_settings=ModelSettings(temperature=0.4),
    )

    prompt = (
        "SPARES (id | name | set | price | spare copies)\n"
        + "\n".join(_line(candidate) for candidate in spares)
        + "\n\nWANTED (id | name | set | price)\n"
        + "\n".join(_line(candidate) for candidate in wanted)
    )
    if goal:
        prompt += f"\n\nWhat the collector asked for: {goal}"

    result = await agent.run(prompt)
    advice = result.output

    give = _keep(advice.give, {candidate.card_id: candidate for candidate in spares})
    receive = _keep(advice.receive, {candidate.card_id: candidate for candidate in wanted})
    if not give or not receive:
        raise LookupError

    return TradeAdvice(give=give, receive=receive, rationale=advice.rationale)
