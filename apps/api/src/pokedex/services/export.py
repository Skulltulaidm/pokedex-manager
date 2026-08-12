import csv
import io
from collections.abc import Iterator, Sequence

from pokedex.db.models import CollectionItem

# Ordered for a spreadsheet: what the card is, then what the user holds, then
# what it is worth.
COLUMNS = [
    "card_id",
    "name",
    "set",
    "number",
    "printed_total",
    "rarity",
    "types",
    "condition",
    "language",
    "quantity",
    "is_graded",
    "grade",
    "price_usd",
    "acquired_at",
    "notes",
]


def _row(item: CollectionItem) -> dict[str, object]:
    card = item.card
    return {
        "card_id": card.id,
        "name": card.name,
        "set": card.card_set.name,
        "number": card.number,
        "printed_total": card.card_set.printed_total,
        "rarity": card.rarity or "",
        "types": " ".join(card.species.types) if card.species else "",
        "condition": item.condition.value,
        "language": item.language,
        "quantity": item.quantity,
        "is_graded": item.is_graded,
        "grade": item.grade if item.grade is not None else "",
        "price_usd": card.price_usd if card.price_usd is not None else "",
        "acquired_at": item.acquired_at.isoformat() if item.acquired_at else "",
        "notes": item.notes or "",
    }


def to_rows(items: Sequence[CollectionItem]) -> list[dict[str, object]]:
    return [_row(item) for item in items]


def to_csv(items: Sequence[CollectionItem]) -> Iterator[str]:
    """Yields the file a row at a time so a large collection never lands in memory."""
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=COLUMNS)

    writer.writeheader()
    yield buffer.getvalue()

    for item in items:
        buffer.seek(0)
        buffer.truncate()
        writer.writerow(_row(item))
        yield buffer.getvalue()
