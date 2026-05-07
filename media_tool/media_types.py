from enum import StrEnum
from pathlib import Path


class MediaKind(StrEnum):
    RAW_PHOTO = "raw_photo"
    PHOTO = "photo"
    VIDEO = "video"
    AUDIO = "audio"
    SIDECAR = "sidecar"


RAW_PHOTO_EXTENSIONS = {
    ".3fr",
    ".arw",
    ".cr2",
    ".cr3",
    ".crw",
    ".dcr",
    ".dng",
    ".erf",
    ".fff",
    ".iiq",
    ".kdc",
    ".mef",
    ".mos",
    ".mrw",
    ".nef",
    ".nrw",
    ".orf",
    ".pef",
    ".raf",
    ".raw",
    ".rw2",
    ".rwl",
    ".sr2",
    ".srf",
    ".srw",
    ".x3f",
}

PHOTO_EXTENSIONS = {
    ".avif",
    ".heic",
    ".heif",
    ".jpeg",
    ".jpg",
    ".png",
    ".tif",
    ".tiff",
    ".webp",
}

VIDEO_EXTENSIONS = {
    ".3g2",
    ".3gp",
    ".avi",
    ".braw",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp4",
    ".mxf",
    ".r3d",
}

AUDIO_EXTENSIONS = {
    ".aac",
    ".aif",
    ".aiff",
    ".flac",
    ".m4a",
    ".mp3",
    ".ogg",
    ".wav",
}

SIDECAR_EXTENSIONS = {
    ".aae",
    ".dop",
    ".lrv",
    ".pp3",
    ".thm",
    ".xmp",
}


def normalize_extension(extension: str) -> str:
    cleaned = extension.strip().lower()
    if not cleaned:
        return ""
    if cleaned.startswith("."):
        return cleaned
    return f".{cleaned}"


def classify_extension(extension: str) -> MediaKind | None:
    normalized = normalize_extension(extension)
    if normalized in RAW_PHOTO_EXTENSIONS:
        return MediaKind.RAW_PHOTO
    if normalized in PHOTO_EXTENSIONS:
        return MediaKind.PHOTO
    if normalized in VIDEO_EXTENSIONS:
        return MediaKind.VIDEO
    if normalized in AUDIO_EXTENSIONS:
        return MediaKind.AUDIO
    if normalized in SIDECAR_EXTENSIONS:
        return MediaKind.SIDECAR
    return None


def is_supported_media(path_or_name: str | Path) -> bool:
    return classify_extension(Path(path_or_name).suffix) is not None
