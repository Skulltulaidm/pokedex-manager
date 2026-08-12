from pathlib import Path
from typing import Protocol

from anyio import to_thread


class StorageError(Exception):
    """Raised when a key cannot be read or written."""


class StorageBackend(Protocol):
    """The seam between the app and wherever bytes actually live."""

    async def put(self, key: str, data: bytes) -> str: ...

    async def get(self, key: str) -> bytes: ...

    async def delete(self, key: str) -> None: ...


class LocalFilesystemStorage:
    """Files under a root directory, addressed by key.

    A Docker volume rather than MinIO, which would add a fourth container to
    something that only runs locally.
    """

    def __init__(self, root: Path) -> None:
        self.root = root

    def _resolve(self, key: str) -> Path:
        # Resolving both sides is the traversal check that also survives symlinks.
        target = (self.root / key).resolve()
        if not target.is_relative_to(self.root.resolve()):
            raise StorageError(f"key escapes the storage root: {key!r}")
        return target

    async def put(self, key: str, data: bytes) -> str:
        target = self._resolve(key)

        def write() -> None:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)

        await to_thread.run_sync(write)
        return key

    async def get(self, key: str) -> bytes:
        target = self._resolve(key)
        try:
            return await to_thread.run_sync(target.read_bytes)
        except OSError as exc:
            raise StorageError(f"cannot read {key!r}") from exc

    async def delete(self, key: str) -> None:
        target = self._resolve(key)
        await to_thread.run_sync(lambda: target.unlink(missing_ok=True))
