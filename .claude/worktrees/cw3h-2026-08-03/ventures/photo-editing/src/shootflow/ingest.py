from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path


MEDIA_EXTENSIONS = {
    ".3gp",
    ".ari",
    ".arw",
    ".avi",
    ".braw",
    ".cr2",
    ".cr3",
    ".dng",
    ".heic",
    ".jpeg",
    ".jpg",
    ".m4v",
    ".mov",
    ".mp4",
    ".mts",
    ".nef",
    ".orf",
    ".raf",
    ".r3d",
    ".rw2",
    ".tif",
    ".tiff",
    ".wav",
    ".xavc",
}

_SHOOT_SLUG_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$")


class IngestError(Exception):
    """Base class for safe ingest failures."""


class UnsafePathError(IngestError):
    """Raised when a source or destination path could escape safe ingest roots."""


class CopyConflictError(IngestError):
    """Raised when an existing destination file has different content."""


@dataclass(frozen=True)
class CopyItem:
    source: Path
    destination: Path
    relative_path: Path
    checksum_sha256: str
    size_bytes: int


@dataclass(frozen=True)
class CopyPlan:
    source_root: Path
    destination_root: Path
    shoot_date: str
    shoot_slug: str
    shoot_folder: Path
    items: tuple[CopyItem, ...]


@dataclass(frozen=True)
class CopyReport:
    copied: int
    skipped: int
    manifest_path: Path


@dataclass(frozen=True)
class ImportSourceEstimate:
    source_root: Path
    media_file_count: int
    estimated_bytes: int


def plan_import(
    source_root: Path | str,
    destination_root: Path | str,
    *,
    shoot_date: str,
    shoot_slug: str,
) -> CopyPlan:
    source = Path(source_root)
    destination = Path(destination_root)
    _validate_shoot_identity(shoot_date=shoot_date, shoot_slug=shoot_slug)
    _reject_symlink(source, "source root")

    shoot_folder = destination / f"{shoot_date}_{shoot_slug}"
    originals_root = shoot_folder / "originals"
    items: list[CopyItem] = []

    for media_path in _iter_media_files(source):
        _reject_symlink(media_path, "source media")
        relative_path = media_path.relative_to(source)
        target = originals_root / relative_path
        _ensure_relative_to(target, destination)
        items.append(
            CopyItem(
                source=media_path,
                destination=target,
                relative_path=relative_path,
                checksum_sha256=sha256_file(media_path),
                size_bytes=media_path.stat().st_size,
            )
        )

    return CopyPlan(
        source_root=source,
        destination_root=destination,
        shoot_date=shoot_date,
        shoot_slug=shoot_slug,
        shoot_folder=shoot_folder,
        items=tuple(items),
    )


def execute_copy_plan(plan: CopyPlan) -> CopyReport:
    copied = 0
    skipped = 0

    for item in plan.items:
        _reject_symlink(item.source, "source media")
        _ensure_safe_destination(item.destination, plan.destination_root)

        if item.destination.exists():
            _reject_symlink(item.destination, "destination media")
            if sha256_file(item.destination) != item.checksum_sha256:
                raise CopyConflictError(f"Refusing to overwrite different file: {item.destination}")
            skipped += 1
            continue

        item.destination.parent.mkdir(parents=True, exist_ok=True)
        _reject_symlink_path(item.destination.parent, plan.destination_root, "destination parent")
        temp_path = item.destination.with_name(f".{item.destination.name}.tmp")
        if temp_path.exists() or temp_path.is_symlink():
            raise UnsafePathError(f"Temporary path already exists: {temp_path}")

        with item.source.open("rb") as source_file, temp_path.open("xb") as temp_file:
            shutil.copyfileobj(source_file, temp_file, length=1024 * 1024)

        if sha256_file(temp_path) != item.checksum_sha256:
            temp_path.unlink(missing_ok=True)
            raise CopyConflictError(f"Checksum verification failed for: {item.source}")

        temp_path.replace(item.destination)
        copied += 1

    manifest_path = _write_manifest(plan)
    return CopyReport(copied=copied, skipped=skipped, manifest_path=manifest_path)


def estimate_import_source(source_root: Path | str) -> ImportSourceEstimate:
    source = Path(source_root)
    _reject_symlink(source, "source root")
    files = _iter_media_files(source)
    total_bytes = 0
    for media_path in files:
        _reject_symlink(media_path, "source media")
        total_bytes += media_path.stat().st_size
    return ImportSourceEstimate(
        source_root=source,
        media_file_count=len(files),
        estimated_bytes=total_bytes,
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _iter_media_files(root: Path) -> tuple[Path, ...]:
    if not root.exists():
        raise FileNotFoundError(root)
    files: list[Path] = []
    for path in root.rglob("*"):
        if _any_parent_is_symlink(path, root):
            continue
        if not path.is_file() or path.suffix.lower() not in MEDIA_EXTENSIONS:
            continue
        if path.is_symlink():
            raise UnsafePathError(f"Refusing source media symlink: {path}")
        files.append(path)
    return tuple(sorted(files, key=lambda path: path.as_posix().lower()))


def _validate_shoot_identity(*, shoot_date: str, shoot_slug: str) -> None:
    try:
        date.fromisoformat(shoot_date)
    except ValueError as exc:
        raise UnsafePathError(f"Invalid shoot date: {shoot_date}") from exc

    if not _SHOOT_SLUG_PATTERN.fullmatch(shoot_slug):
        raise UnsafePathError(f"Invalid shoot slug: {shoot_slug}")


def _ensure_relative_to(path: Path, root: Path) -> None:
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise UnsafePathError(f"Path escapes destination root: {path}") from exc


def _ensure_safe_destination(path: Path, destination_root: Path) -> None:
    _ensure_relative_to(path, destination_root)
    for parent in (path.parent, *path.parent.parents):
        if parent == destination_root.parent:
            break
        if parent.exists() and parent.is_symlink():
            raise UnsafePathError(f"Destination parent is a symlink: {parent}")


def _reject_symlink(path: Path, label: str) -> None:
    if path.is_symlink():
        raise UnsafePathError(f"Refusing {label} symlink: {path}")


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    current = path
    while True:
        if current.is_symlink():
            raise UnsafePathError(f"Refusing {label} symlink: {current}")
        if current == root or current.absolute() == root.absolute():
            break
        if current.parent == current:
            break
        current = current.parent


def _any_parent_is_symlink(path: Path, root: Path) -> bool:
    current = path.parent
    while current != root and current.parent != current:
        if current.is_symlink():
            return True
        current = current.parent
    return False


def _write_text_no_follow(path: Path, content: str) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags, 0o600)
    except OSError as exc:
        raise UnsafePathError(f"Unable to create temporary manifest: {path}") from exc
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
    except OSError as exc:
        raise UnsafePathError(f"Unable to write temporary manifest: {path}") from exc


def _write_manifest(plan: CopyPlan) -> Path:
    manifest_path = plan.shoot_folder / "ingest_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    _ensure_safe_destination(manifest_path, plan.destination_root)
    if manifest_path.is_symlink():
        raise UnsafePathError(f"Manifest path is a symlink: {manifest_path}")

    data = {
        "shoot_date": plan.shoot_date,
        "shoot_slug": plan.shoot_slug,
        "source_root": str(plan.source_root),
        "destination_root": str(plan.destination_root),
        "source_deleted": False,
        "items": [
            {
                "source": str(item.source),
                "destination": str(item.destination),
                "relative_path": item.relative_path.as_posix(),
                "checksum_sha256": item.checksum_sha256,
                "size_bytes": item.size_bytes,
            }
            for item in plan.items
        ],
    }
    temp_path = manifest_path.with_name(".ingest_manifest.json.tmp")
    if temp_path.exists() or temp_path.is_symlink():
        raise UnsafePathError(f"Manifest temporary path already exists: {temp_path}")
    _write_text_no_follow(temp_path, json.dumps(data, indent=2, sort_keys=True))
    temp_path.replace(manifest_path)
    return manifest_path
