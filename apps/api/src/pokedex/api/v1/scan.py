from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from pokedex.api.deps import CurrentUser, DbSession
from pokedex.config import get_settings
from pokedex.schemas.collection import AddCardRequest
from pokedex.schemas.scan import CardReading, ScanResult
from pokedex.services import collection, resolve
from pokedex.services import scan as scans
from pokedex.storage import InvalidImageError, LocalFilesystemStorage, StorageBackend, prepare

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

    # Vision is not wired in yet; an empty reading resolves to `failed`, which is
    # the same path a provider outage takes and diverts the user to manual entry.
    reading = CardReading()
    result = await resolve.resolve(db, reading)

    await scans.record(db, scan_id, user.id, key, reading, result, model=None)
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


@router.post("/{scan_id}/confirm", status_code=status.HTTP_201_CREATED)
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

    item = await collection.add_card(db, user.id, payload)
    scan.resolved_card_id = payload.card_id
    return item
