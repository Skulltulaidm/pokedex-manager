from sqlalchemy import Float, case, cast, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from sqlalchemy.sql.elements import ColumnElement

from pokedex.db.models import Card, CardSet
from pokedex.integrations.tcgdex import normalize_name
from pokedex.schemas.catalog import CardView
from pokedex.schemas.scan import CardCandidate, CardReading, ScanResult, ScanStatusName

# Every signal contributes; none vetoes. A hard filter on a misread field would
# discard the right card.
W_SET_TOTAL = 0.35
W_NUMBER = 0.35
W_NAME = 0.25
W_HP = 0.05

# Above this a candidate is worth showing at all.
PLAUSIBLE = 0.4
# Above this, and clear of the runner-up, the answer is taken as settled.
CONFIDENT = 0.7
# A margin, not a ceiling on the runner-up: in a full catalog near-miss scores
# around 0.45 are always present and would make every scan ambiguous.
MARGIN = 0.3

MAX_CANDIDATES = 8


def _score_and_filter(
    reading: CardReading, normalized: str | None
) -> tuple[ColumnElement[float], list[ColumnElement[bool]]]:
    """The weighted score, plus the conditions that bound which rows are scored.

    Scoring the whole catalog would be correct but wasteful, so rows are narrowed
    to those where at least one signal already agrees. The narrowing is a union,
    never an intersection: that keeps a single misread field from excluding the
    card it belongs to.
    """
    score: ColumnElement[float] = literal(0.0)
    conditions: list[ColumnElement[bool]] = []

    if reading.set_total is not None:
        score = score + case((CardSet.printed_total == reading.set_total, W_SET_TOTAL), else_=0.0)
        conditions.append(CardSet.printed_total == reading.set_total)

    if reading.collector_number:
        score = score + case((Card.number_prefix == reading.collector_number, W_NUMBER), else_=0.0)
        conditions.append(Card.number_prefix == reading.collector_number)

    if normalized:
        score = score + cast(func.similarity(Card.name_normalized, normalized), Float) * W_NAME
        # `%` is the trigram operator, so this hits the GIN index instead of
        # computing similarity for every row in the catalog.
        conditions.append(Card.name_normalized.op("%")(normalized))

    if reading.hp is not None:
        score = score + case((Card.hp == reading.hp, W_HP), else_=0.0)

    return score, conditions


def _matched_on(reading: CardReading, card: Card, similarity: float) -> list[str]:
    matched = []
    if reading.set_total is not None and card.card_set.printed_total == reading.set_total:
        matched.append("set_total")
    if reading.collector_number and card.number_prefix == reading.collector_number:
        matched.append("collector_number")
    if similarity > 0:
        matched.append("name")
    if reading.hp is not None and card.hp == reading.hp:
        matched.append("hp")
    return matched


def _status(candidates: list[CardCandidate]) -> ScanStatusName:
    if not candidates or candidates[0].score < PLAUSIBLE:
        return "failed"

    runner_up = candidates[1].score if len(candidates) > 1 else 0.0
    if candidates[0].score >= CONFIDENT and candidates[0].score - runner_up >= MARGIN:
        return "resolved"
    return "ambiguous"


async def resolve(db: AsyncSession, reading: CardReading) -> ScanResult:
    """Turn a transcription into ranked candidates from the catalog.

    This step is deliberately deterministic and auditable: the model reads the
    card, and this decides which card it is.
    """
    normalized = normalize_name(reading.name) if reading.name else None
    score, conditions = _score_and_filter(reading, normalized)

    if not conditions:
        return ScanResult(reading=reading, candidates=[], status="failed")

    similarity = (
        cast(func.similarity(Card.name_normalized, normalized), Float)
        if normalized
        else literal(0.0)
    )

    result = await db.execute(
        select(Card, score.label("score"), similarity.label("similarity"))
        .join(CardSet, CardSet.id == Card.set_id)
        .options(joinedload(Card.card_set), joinedload(Card.species))
        .where(or_(*conditions))
        .order_by(score.desc())
        .limit(MAX_CANDIDATES)
    )

    candidates = [
        CardCandidate(
            card=CardView.model_validate(card),
            score=round(row_score, 4),
            matched_on=_matched_on(reading, card, row_similarity),
        )
        for card, row_score, row_similarity in result
        if row_score >= PLAUSIBLE
    ]

    return ScanResult(reading=reading, candidates=candidates, status=_status(candidates))
