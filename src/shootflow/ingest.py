from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".heic", ".png", ".tif", ".tiff"}
RAW_EXTENSIONS = {".cr2", ".cr3", ".nef", ".arw", ".dng", ".raf", ".rw2", ".orf"}
VIDEO_EXTENSIONS = {".mov", ".mp4", ".m4v", ".avi", ".mxf", ".braw", ".r3d"}
AUDIO_EXTENSIONS = {".wav", ".aif", ".aiff", ".mp3", ".m4a"}
SUPPORTED_EXTENSIONS = PHOTO_EXTENSIONS | RAW_EXTENSIONS | VIDEO_EXTENSIONS | AUDIO_EXTENSIONS

_SAFE_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}[a-z0-9]$")
_SAFE_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class IngestSafetyError(ValueError):
    """Raised when an ingest path or operation violates media safety rules."""


@dataclass(frozen=True)
class IngestItem:
    source_path: Path
    destination_path: Path
    media_kind: str
    source_size: int
    destination_size: int
    source_sha256: str
    destination_sha256: str
    source_deleted: bool = False

    def to_json(self) -> dict[str, object]:
        return {
            "source_path": str(self.source_path),
            "destination_path": str(self.destination_path),
            "media_kind": self.media_kind,
            "source_size": self.source_size,
            "destination_size": self.destination_size,
            "source_sha256": self.source_sha256,
            "destination_sha256": self.destination_sha256,
            "source_deleted": self.source_deleted,
        }


@dataclass(frozen=True)
class IngestManifest:
    source_root: Path
    destination_root: Path
    shoot_slug: str
    shoot_date: str
    shoot_directory: Path
    manifest_path: Path
    items: tuple[IngestItem, ...]

    def to_json(self) -> dict[str, object]:
        return {
            "source_root": str(self.source_root),
            "destination_root": str(self.destination_root),
            "shoot_slug": self.shoot_slug,
            "shoot_date": self.shoot_date,
            "shoot_directory": str(self.shoot_directory),
            "items": [item.to_json() for item in self.items],
        }


def import_shoot(
    source_root: Path | str,
    destination_root: Path | str,
    *,
    shoot_slug: str,
    shoot_date: str,
) -> IngestManifest:
    """Safely copy supported media into a dated shoot folder and write a manifest.

    The importer is intentionally conservative: it never deletes source media,
    never follows symlinked media files, and never overwrites a destination file
    with different bytes.
    """

    source = Path(source_root)
    destination = Path(destination_root)
    _validate_shoot_identity(shoot_slug, shoot_date)
    _require_existing_directory(source, "source_root")
    _reject_symlink_path(source, "source_root")
    _reject_symlink_path(destination, "destination_root")

    shoot_directory = destination / f"{shoot_date}_{shoot_slug}"
    originals_directory = shoot_directory / "originals"
    _ensure_safe_directory(originals_directory)

    items = tuple(
        _copy_media_file(media_path, originals_directory)
        for media_path in _iter_supported_media(source)
    )

    manifest_path = shoot_directory / "ingest_manifest.json"
    _reject_symlink_path(manifest_path, "manifest_path")
    manifest = IngestManifest(
        source_root=source,
        destination_root=destination,
        shoot_slug=shoot_slug,
        shoot_date=shoot_date,
        shoot_directory=shoot_directory,
        manifest_path=manifest_path,
        items=items,
    )
    _write_manifest(manifest)
    return manifest


def _validate_shoot_identity(shoot_slug: str, shoot_date: str) -> None:
    if not _SAFE_SLUG.fullmatch(shoot_slug):
        raise IngestSafetyError("shoot_slug must be lowercase kebab-case without path separators")
    if not _SAFE_DATE.fullmatch(shoot_date):
        raise IngestSafetyError("shoot_date must use YYYY-MM-DD")


def _require_existing_directory(path: Path, label: str) -> None:
    if not path.exists():
        raise IngestSafetyError(f"{label} does not exist: {path}")
    if not path.is_dir():
        raise IngestSafetyError(f"{label} is not a directory: {path}")


def _iter_supported_media(source: Path) -> Iterable[Path]:
    for path in sorted(source.rglob("*")):
        if path.is_symlink() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
            raise IngestSafetyError(f"refusing to ingest symlinked media: {path}")
        if not path.is_file():
            continue
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        _reject_symlink_path(path, "media source")
        yield path


def _copy_media_file(source_path: Path, originals_directory: Path) -> IngestItem:
    source_size = source_path.stat().st_size
    source_sha256 = _sha256(source_path)
    media_kind = _media_kind(source_path)
    destination_path = _available_destination_path(
        originals_directory / source_path.name,
        source_sha256=source_sha256,
    )

    if not destination_path.exists():
        temp_path = destination_path.with_name(f".{destination_path.name}.tmp")
        _reject_symlink_path(temp_path, "temporary destination")
        try:
            shutil.copy2(source_path, temp_path)
            copied_sha256 = _sha256(temp_path)
            copied_size = temp_path.stat().st_size
            if copied_sha256 != source_sha256 or copied_size != source_size:
                raise IngestSafetyError(f"copy verification failed for {source_path}")
            os.replace(temp_path, destination_path)
        finally:
            if temp_path.exists():
                temp_path.unlink()

    destination_size = destination_path.stat().st_size
    destination_sha256 = _sha256(destination_path)
    if destination_sha256 != source_sha256 or destination_size != source_size:
        raise IngestSafetyError(f"destination verification failed for {destination_path}")

    return IngestItem(
        source_path=source_path,
        destination_path=destination_path,
        media_kind=media_kind,
        source_size=source_size,
        destination_size=destination_size,
        source_sha256=source_sha256,
        destination_sha256=destination_sha256,
    )


def _available_destination_path(candidate: Path, *, source_sha256: str) -> Path:
    _reject_symlink_path(candidate, "destination")
    if not candidate.exists():
        return candidate
    if candidate.is_symlink():
        raise IngestSafetyError(f"refusing to overwrite symlink destination: {candidate}")
    if _sha256(candidate) == source_sha256:
        return candidate

    stem = candidate.stem
    suffix = candidate.suffix
    for index in range(1, 10_000):
        alternate = candidate.with_name(f"{stem}__{index}{suffix}")
        _reject_symlink_path(alternate, "destination")
        if not alternate.exists():
            return alternate
        if alternate.is_symlink():
            raise IngestSafetyError(f"refusing to overwrite symlink destination: {alternate}")
        if _sha256(alternate) == source_sha256:
            return alternate
    raise IngestSafetyError(f"could not allocate safe destination path for {candidate.name}")


def _media_kind(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in PHOTO_EXTENSIONS:
        return "photo"
    if suffix in RAW_EXTENSIONS:
        return "raw"
    if suffix in VIDEO_EXTENSIONS:
        return "video"
    if suffix in AUDIO_EXTENSIONS:
        return "audio"
    raise IngestSafetyError(f"unsupported media extension: {path.suffix}")


def _ensure_safe_directory(path: Path) -> None:
    _reject_symlink_path(path, "directory")
    path.mkdir(parents=True, exist_ok=True)
    _reject_symlink_path(path, "directory")


def _write_manifest(manifest: IngestManifest) -> None:
    manifest_payload = json.dumps(manifest.to_json(), indent=2, sort_keys=True)
    temp_path = manifest.manifest_path.with_name(".ingest_manifest.json.tmp")
    _reject_symlink_path(temp_path, "manifest temporary path")
    temp_path.write_text(f"{manifest_payload}\n", encoding="utf-8")
    os.replace(temp_path, manifest.manifest_path)


def _reject_symlink_path(path: Path, label: str) -> None:
    existing_parts: list[Path] = []
    current = path
    while True:
        existing_parts.append(current)
        if current.exists() or current.parent == current:
            break
        current = current.parent

    for part in reversed(existing_parts):
        if part.exists() and part.is_symlink():
            raise IngestSafetyError(f"{label} contains a symlink: {part}")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
