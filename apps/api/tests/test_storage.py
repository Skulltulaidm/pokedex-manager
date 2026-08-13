import io
from pathlib import Path

import pytest
from PIL import Image

from pokedex.storage import (
    InvalidImageError,
    LocalFilesystemStorage,
    StorageError,
    prepare,
    sniff,
)
from pokedex.storage.images import LONG_EDGE, MAX_UPLOAD_BYTES


def photo(width: int, height: int, fmt: str = "JPEG") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), "orange").save(buffer, format=fmt)
    return buffer.getvalue()


async def test_put_then_get_round_trips(tmp_path: Path) -> None:
    storage = LocalFilesystemStorage(tmp_path)

    key = await storage.put("alex/scan.jpg", b"bytes")

    assert key == "alex/scan.jpg"
    assert await storage.get(key) == b"bytes"
    assert (tmp_path / "alex" / "scan.jpg").exists()


async def test_a_key_cannot_escape_the_root(tmp_path: Path) -> None:
    """A key is user-adjacent data, so traversal has to be refused, not assumed away."""
    storage = LocalFilesystemStorage(tmp_path)

    with pytest.raises(StorageError, match="escapes"):
        await storage.put("../../escaped.jpg", b"bytes")


async def test_delete_is_idempotent(tmp_path: Path) -> None:
    storage = LocalFilesystemStorage(tmp_path)
    await storage.delete("never/existed.jpg")


def test_a_renamed_text_file_is_rejected() -> None:
    """Extension and Content-Type are attacker-controlled; the bytes are not."""
    with pytest.raises(InvalidImageError, match="no es una imagen"):
        prepare(b"#!/bin/sh\nrm -rf /\n")


def test_an_empty_upload_is_rejected() -> None:
    with pytest.raises(InvalidImageError, match="vacío"):
        prepare(b"")


def test_an_oversized_upload_is_rejected() -> None:
    with pytest.raises(InvalidImageError, match="10 MB"):
        prepare(b"\xff\xd8\xff" + b"\x00" * MAX_UPLOAD_BYTES)


def test_sniff_recognises_the_formats_a_phone_produces() -> None:
    assert sniff(photo(10, 10, "JPEG")) == "jpeg"
    assert sniff(photo(10, 10, "PNG")) == "png"
    assert sniff(photo(10, 10, "HEIF")) == "heic"
    assert sniff(b"not an image") is None


def test_sniff_finds_the_heic_brand_past_the_box_header() -> None:
    """HEIC states its brand at byte 4, after the box length, not at byte 0."""
    assert sniff(b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00") == "heic"
    assert sniff(b"\x00\x00\x00\x18ftypqt  \x00\x00\x00\x00") is None


def test_a_heic_photo_is_accepted_and_stored_as_jpeg() -> None:
    """The default camera format on an iPhone, and on macOS Photos exports."""
    prepared = prepare(photo(900, 1200, "HEIF"))

    with Image.open(io.BytesIO(prepared)) as image:
        assert image.format == "JPEG"
        assert image.size == (900, 1200)


def test_a_large_photo_is_downscaled() -> None:
    prepared = prepare(photo(4000, 3000))

    with Image.open(io.BytesIO(prepared)) as image:
        assert max(image.size) == LONG_EDGE
        assert image.format == "JPEG"


def test_a_small_photo_is_not_upscaled() -> None:
    prepared = prepare(photo(600, 400))

    with Image.open(io.BytesIO(prepared)) as image:
        assert image.size == (600, 400)


def test_a_png_upload_is_re_encoded_as_jpeg() -> None:
    """One stored format keeps the model's input and the audit trail identical."""
    prepared = prepare(photo(800, 600, "PNG"))

    with Image.open(io.BytesIO(prepared)) as image:
        assert image.format == "JPEG"
