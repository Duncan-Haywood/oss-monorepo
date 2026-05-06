from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


MediaKind = Literal["raw", "jpeg", "video"]

RAW_EXTENSIONS = {
    ".3fr",
    ".ari",
    ".arw",
    ".cr2",
    ".cr3",
    ".dng",
    ".fff",
    ".iiq",
    ".nef",
    ".orf",
    ".raf",
    ".raw",
    ".rwl",
    ".rw2",
}
JPEG_EXTENSIONS = {".jpg", ".jpeg"}
VIDEO_EXTENSIONS = {
    ".avi",
    ".braw",
    ".insv",
    ".m4v",
    ".mov",
    ".mp4",
    ".mxf",
    ".r3d",
}
SHOOT_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._ -]*$")


@dataclass(frozen=True, slots=True)
class MediaAsset:
    source_path: Path
    relative_path: Path
    kind: MediaKind
    size_bytes: int
    checksum: str


@dataclass(frozen=True, slots=True)
class CopyAction:
    source: Path
    destination: Path
    checksum: str
    size_bytes: int


@dataclass(frozen=True, slots=True)
class IngestConflict:
    source: Path
    destination: Path
    reason: str


@dataclass(frozen=True, slots=True)
class IngestPlan:
    source_root: Path
    destination_root: Path
    destination_shoot_root: Path
    assets: list[MediaAsset]
    copy_actions: list[CopyAction]
    verified_existing: list[MediaAsset]
    conflicts: list[IngestConflict]
    deletions: list[Path]


def build_ingest_plan(
    *,
    source_root: Path,
    destination_root: Path,
    shoot_name: str,
) -> IngestPlan:
    """Build a non-destructive copy plan for media files under a source root."""
    if not isinstance(source_root, Path):
        raise TypeError("source_root must be a pathlib.Path")
    if not isinstance(destination_root, Path):
        raise TypeError("destination_root must be a pathlib.Path")
    if not isinstance(shoot_name, str):
        raise TypeError("shoot_name must be a string")
    if not source_root.exists():
        raise FileNotFoundError(f"source_root does not exist: {source_root}")
    if not source_root.is_dir():
        raise NotADirectoryError(f"source_root must be a directory: {source_root}")
    if not shoot_name.strip():
        raise ValueError("shoot_name cannot be empty")
    if not SHOOT_NAME_PATTERN.match(shoot_name):
        raise ValueError("shoot_name contains unsupported characters")

    destination_shoot_root = destination_root / shoot_name.strip()
    assets = list(_discover_media_assets(source_root))
    copy_actions: list[CopyAction] = []
    verified_existing: list[MediaAsset] = []
    conflicts: list[IngestConflict] = []

    for asset in assets:
        destination = destination_shoot_root / asset.kind / asset.relative_path
        if destination.exists():
            destination_checksum = _sha256(destination)
            if destination_checksum == asset.checksum:
                verified_existing.append(asset)
            else:
                conflicts.append(
                    IngestConflict(
                        source=asset.source_path,
                        destination=destination,
                        reason="destination exists with different checksum",
                    )
                )
            continue

        copy_actions.append(
            CopyAction(
                source=asset.source_path,
                destination=destination,
                checksum=asset.checksum,
                size_bytes=asset.size_bytes,
            )
        )

    return IngestPlan(
        source_root=source_root,
        destination_root=destination_root,
        destination_shoot_root=destination_shoot_root,
        assets=assets,
        copy_actions=copy_actions,
        verified_existing=verified_existing,
        conflicts=conflicts,
        deletions=[],
    )


def _discover_media_assets(source_root: Path) -> list[MediaAsset]:
    assets: list[MediaAsset] = []
    for path in sorted(source_root.rglob("*")):
        if not path.is_file():
            continue

        kind = _kind_for_extension(path.suffix)
        if kind is None:
            continue

        assets.append(
            MediaAsset(
                source_path=path,
                relative_path=path.relative_to(source_root),
                kind=kind,
                size_bytes=path.stat().st_size,
                checksum=_sha256(path),
            )
        )
    return assets


def _kind_for_extension(extension: str) -> MediaKind | None:
    normalized = extension.lower()
    if normalized in RAW_EXTENSIONS:
        return "raw"
    if normalized in JPEG_EXTENSIONS:
        return "jpeg"
    if normalized in VIDEO_EXTENSIONS:
        return "video"
    return None


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
