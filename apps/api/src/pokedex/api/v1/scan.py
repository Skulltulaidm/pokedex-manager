import logging
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from pokedex.agent import read_card
from pokedex.api.deps import CurrentUser, DbSession
from pokedex.config import get_settings
from pokedex.schemas.catalog import CollectionItemView
from pokedex.schemas.collection import AddCardRequest
from pokedex.schemas.scan import CardReading, ScanResult
from pokedex.services import collection, resolve
from pokedex.services import scan as scans
from pokedex.storage import InvalidImageError, LocalFilesystemStorage, StorageBackend, prepare

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scans", tags=["scans"])


def get_storage() -> StorageBackend:
    return LocalFilesystemStorage(get_settings().storage_root)


Storage = Annotated[StorageBackend, Depends(get_storage)]


@router.post("", response_model=ScanResult, status_code=status.HTTP_201_CREATED)
async def create_scan(
    user: CurrentUser,
    db: DbSession,
    storage: Storage,
    image: Annotated[UploadFile, File()],
) -> Any:
    """Read a card photo and propose which card it is.

    Reading and identifying are separate steps on purpose: the model transcribes
    what is printed, and the lookup decides which card those glyphs belong to.
    """
    try:
        prepared = prepare(await image.read())
    except InvalidImageError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    scan_id, key = await scans.store_image(storage, user.id, prepared)
    model = get_settings().vision_model

    try:
        reading = await read_card(prepared, model)
    except Exception:
        # A provider outage degrades this scan to manual entry; the row is still
        # written so the stored image can be retried without reading it again.
        logger.exception("vision extraction failed")
        reading = CardReading()

    result = await resolve.resolve(db, reading)

    await scans.record(db, scan_id, user.id, key, reading, result, model=model)
    result.scan_id = scan_id
    return result


@router.get("/{scan_id}/image")
async def get_scan_image(
    scan_id: UUID, user: CurrentUser, db: DbSession, storage: Storage
) -> Response:
    """Scan photos are private, so they are streamed through auth rather than served
    as static files. Mounting the directory would leak every user's photos."""
    scan = await scans.get_scan(db, user.id, scan_id)
    if scan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan not found")

    return Response(content=await storage.get(scan.image_key), media_type="image/jpeg")


@router.post(
    "/{scan_id}/confirm",
    response_model=CollectionItemView,
    status_code=status.HTTP_201_CREATED,
)
async def confirm_scan(
    scan_id: UUID, payload: AddCardRequest, user: CurrentUser, db: DbSession
) -> Any:
    """Save the card the user picked from the candidates.

    The choice is always the user's: a scan proposes, it never files anything on
    its own.
    """
    scan = await scans.get_scan(db, user.id, scan_id)
    if scan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan not found")

    try:
        item = await collection.add_card(db, user.id, payload)
    except collection.CardNotFoundError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown card: {payload.card_id}"
        ) from exc

    scan.resolved_card_id = payload.card_id

    # Relationships load lazily with raise-on-access, so the view needs the row
    # re-read rather than the one the insert returned.
    stored = await collection.get_item(db, user.id, item.id)
    if stored is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection item not found")
    return CollectionItemView.model_validate(stored)
