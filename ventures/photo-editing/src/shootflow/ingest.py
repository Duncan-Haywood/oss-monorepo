from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path


# Raw formats a camera writes to its card. The copy keeps every one of them,
# developable here or not: a raw left on the card by a copy that ignored its
# extension is a frame lost when the card is formatted. Only some develop
# (``raw_preview.is_developable_path``); the rest are copied, catalogued and culled
# from their embedded preview.
RAW_PHOTO_EXTENSIONS = frozenset(
    {
        ".3fr",  # Hasselblad
        ".arw",  # Sony
        ".cr2",  # Canon
        ".cr3",  # Canon
        ".crw",  # Canon, 2000-2004 (D30, D60, 10D, 300D, PowerShot G)
        ".dcr",  # Kodak
        ".dng",
        ".erf",  # Epson
        ".fff",  # Hasselblad / Imacon
        ".gpr",  # GoPro
        ".iiq",  # Phase One
        ".kdc",  # Kodak
        ".mef",  # Mamiya
        ".mos",  # Leaf
        ".mrw",  # Minolta
        ".nef",  # Nikon
        ".nrw",  # Nikon Coolpix
        ".orf",  # Olympus / OM System
        ".pef",  # Pentax
        ".raf",  # Fujifilm
        ".raw",  # Panasonic and Leica compacts before RW2
        ".rw2",  # Panasonic
        ".rwl",  # Leica bodies built by Panasonic (D-LUX, V-LUX, C-LUX)
        ".sr2",  # Sony
        ".srf",  # Sony
        ".srw",  # Samsung
        ".x3f",  # Sigma
    }
)

# Edits a photographer or another tool already made, kept next to the frame they
# describe (Lightroom, Capture One, darktable and the cameras that write XMP).
SIDECAR_EXTENSIONS = frozenset({".xmp"})

MEDIA_EXTENSIONS = RAW_PHOTO_EXTENSIONS | SIDECAR_EXTENSIONS | {
    ".3gp",
    ".ari",
    ".avi",
    ".braw",
    ".crm",  # Canon Cinema RAW Light
    ".heic",
    ".heif",
    ".hif",  # Canon and Fujifilm 10-bit HEIF
    ".insp",  # Insta360 photo
    ".insv",  # Insta360 video
    ".jpeg",
    ".jpg",
    ".lrv",  # GoPro / Insta360 low-resolution proxy
    ".m2ts",
    ".m4v",
    ".mov",
    ".mp4",
    ".mts",
    ".mxf",  # Sony XAVC, Canon Cinema EOS, Panasonic P2
    ".r3d",
    ".tif",
    ".tiff",
    ".wav",
    ".xavc",
}

# Files a card or an operating system writes that hold no picture or sound; they
# are neither copied nor reported as left behind.
_CARD_HOUSEKEEPING = frozenset(
    {".bin", ".bnp", ".ctg", ".dat", ".db", ".ind", ".ini", ".lck", ".log", ".thm", ".tmp", ".bdm", ".cpi", ".mpl", ".smi"}
)

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
    # Files on the card that are not copied (their extension is not media), as
    # paths relative to ``source_root``, so nothing is left behind unseen.
    left_on_card: tuple[Path, ...] = ()


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
        left_on_card=_files_left_on_card(source),
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
        # Hidden files are never pictures: a Mac writes '._IMG_0001.CR3' (AppleDouble,
        # 4 KB of Finder metadata) beside each file on an exFAT or FAT card, which has the
        # raw's extension and would otherwise be copied and fail to develop.
        if any(part.startswith(".") for part in path.relative_to(root).parts):
            continue
        if path.is_symlink():
            raise UnsafePathError(f"Refusing source media symlink: {path}")
        files.append(path)
    return tuple(sorted(files, key=lambda path: path.as_posix().lower()))


def _files_left_on_card(root: Path) -> tuple[Path, ...]:
    """Files under ``root`` the copy will not take, minus hidden files and card housekeeping.

    A raw format nobody listed, an audio memo, a cinema camera's clip metadata: the
    photographer sees each before formatting the card, rather than finding out later.
    """

    left: list[Path] = []
    for path in root.rglob("*"):
        if _any_parent_is_symlink(path, root) or path.is_symlink() or not path.is_file():
            continue
        relative = path.relative_to(root)
        if any(part.startswith(".") for part in relative.parts):
            continue
        suffix = path.suffix.lower()
        if suffix in MEDIA_EXTENSIONS or suffix in _CARD_HOUSEKEEPING:
            continue
        left.append(relative)
    return tuple(sorted(left, key=lambda path: path.as_posix().lower()))


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
        # Not copied: review before formatting the card (ingest._files_left_on_card).
        "left_on_card": [path.as_posix() for path in plan.left_on_card],
    }
    temp_path = manifest_path.with_name(".ingest_manifest.json.tmp")
    if temp_path.exists() or temp_path.is_symlink():
        raise UnsafePathError(f"Manifest temporary path already exists: {temp_path}")
    _write_text_no_follow(temp_path, json.dumps(data, indent=2, sort_keys=True))
    temp_path.replace(manifest_path)
    return manifest_path
