from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from pokedex.schemas.catalog import CardView

ScanStatusName = Literal["resolved", "ambiguous", "failed"]


class CardReading(BaseModel):
    """What is PRINTED on the card. It does not identify: it transcribes.

    Merging transcription and identification is what makes these features
    hallucinate a card that fits what the model thinks it saw.
    """

    name: str | None = None
    # "4", read from "4/102"
    collector_number: str | None = None
    # 102, read from "4/102". The single most discriminating field on the card:
    # only a handful of sets were printed with exactly this many cards.
    set_total: int | None = None
    set_symbol_text: str | None = None
    hp: int | None = None
    rarity_symbol: Literal["circle", "diamond", "star", "none"] | None = None
    variant_hints: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "low"

    @field_validator("set_total", "hp", "collector_number", mode="after")
    @classmethod
    def drop_impossible(cls, value: int | str | None) -> int | str | None:
        """Out-of-range values are treated as unread.

        Both columns these compare against are SMALLINT, so a hallucinated 99999
        aborts the query rather than merely scoring badly.
        """
        if isinstance(value, int) and not 1 <= value <= 1000:
            return None
        if isinstance(value, str) and len(value) > 16:
            return None
        return value

    @model_validator(mode="after")
    def split_printed_fraction(self) -> "CardReading":
        # Models routinely return the whole "4/102" for collector_number despite
        # the instruction, which then matches no card at all.
        if self.collector_number and "/" in self.collector_number:
            left, _, right = self.collector_number.partition("/")
            self.collector_number = left.strip() or None
            if self.set_total is None and right.strip().isdigit():
                self.set_total = int(right.strip())
        return self


class CardCandidate(BaseModel):
    card: CardView
    score: float
    # Which signals agreed, so the interface can show *why* this card is proposed
    # rather than asking the user to trust a number.
    matched_on: list[str]


class ScanResult(BaseModel):
    scan_id: UUID | None = None
    reading: CardReading
    candidates: list[CardCandidate]
    status: ScanStatusName
