from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pokedex.db.models import Scan, ScanStatus
from pokedex.schemas.scan import CardReading, ScanResult
from pokedex.storage import StorageBackend


# Ownership is visible in the path itself, which makes it auditable without a
# database round trip and turns deleting a user into removing a directory.
def image_key(user_id: str, scan_id: UUID) -> str:
    return f"{user_id}/{scan_id}.jpg"


STATUS_BY_NAME = {
    "resolved": ScanStatus.RESOLVED,
    "ambiguous": ScanStatus.AMBIGUOUS,
    "failed": ScanStatus.FAILED,
}


async def store_image(
    storage: StorageBackend, user_id: str, image: bytes
) -> tuple[UUID, str]:
    """Persist the image first, so a later vision failure still has something to retry."""
    scan_id = uuid4()
    key = image_key(user_id, scan_id)
    await storage.put(key, image)
    return scan_id, key


async def record(
    db: AsyncSession,
    scan_id: UUID,
    user_id: str,
    key: str,
    reading: CardReading | None,
    result: ScanResult | None,
    model: str | None,
) -> Scan:
    """Record what the model read and what the lookup made of it.

    Makes a failed scan diagnosable and lets a retry skip the vision cost.
    """
    scan = Scan(
        id=scan_id,
        user_id=user_id,
        image_key=key,
        extracted=reading.model_dump(mode="json") if reading else None,
        candidate_ids=[c.card.id for c in result.candidates] if result else None,
        resolved_card_id=(
            result.candidates[0].card.id
            if result and result.status == "resolved" and result.candidates
            else None
        ),
        status=STATUS_BY_NAME[result.status] if result else ScanStatus.FAILED,
        model=model,
    )
    db.add(scan)
    await db.flush()
    return scan


async def get_scan(db: AsyncSession, user_id: str, scan_id: UUID) -> Scan | None:
    """Scoped by user: the id alone must never grant access to someone's photo."""
    result = await db.execute(
        select(Scan).where(Scan.id == scan_id, Scan.user_id == user_id)
    )
    return result.scalar_one_or_none()
