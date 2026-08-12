import io

from PIL import Image, ImageOps, UnidentifiedImageError

# Checked against the file's own bytes: extension and Content-Type are both
# supplied by the caller.
MAGIC = {
    b"\xff\xd8\xff": "jpeg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"RIFF": "webp",
    b"II*\x00": "tiff",
    b"MM\x00*": "tiff",
}

MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# A card stays legible at 1600px, and vision cost scales with image size.
LONG_EDGE = 1600
JPEG_QUALITY = 88


class InvalidImageError(ValueError):
    """The upload is not an image this app is willing to process."""


def sniff(data: bytes) -> str | None:
    return next((kind for magic, kind in MAGIC.items() if data.startswith(magic)), None)


def prepare(data: bytes) -> bytes:
    """Validate, downscale and re-encode an upload to a storable JPEG.

    The stored image and the one sent to the model are the same bytes, so what a
    reviewer later sees is exactly what the model was shown.
    """
    if not data:
        raise InvalidImageError("El archivo está vacío.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise InvalidImageError("La imagen supera los 10 MB.")
    if sniff(data) is None:
        raise InvalidImageError("El archivo no es una imagen válida.")

    try:
        with Image.open(io.BytesIO(data)) as image:
            # Re-encoding drops EXIF orientation, so apply it before saving.
            upright = ImageOps.exif_transpose(image) or image
            upright.thumbnail((LONG_EDGE, LONG_EDGE), Image.Resampling.LANCZOS)

            buffer = io.BytesIO()
            upright.convert("RGB").save(buffer, format="JPEG", quality=JPEG_QUALITY)
            return buffer.getvalue()
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImageError("No se pudo leer la imagen.") from exc
