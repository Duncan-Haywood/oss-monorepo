from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from hashlib import sha256
from pathlib import Path
import re


class MediaKind(Enum):
    RAW = "raw"
    JPEG = "jpeg"
    VIDEO = "video"
    AUDIO = "audio"
    SIDECAR = "sidecar"


MEDIA_EXTENSIONS: dict[str, MediaKind] = {
    ".3fr": MediaKind.RAW,
    ".ari": MediaKind.RAW,
    ".arw": MediaKind.RAW,
    ".cr2": MediaKind.RAW,
    ".cr3": MediaKind.RAW,
    ".dng": MediaKind.RAW,
    ".nef": MediaKind.RAW,
    ".orf": MediaKind.RAW,
    ".raf": MediaKind.RAW,
    ".rw2": MediaKind.RAW,
    ".jpg": MediaKind.JPEG,
    ".jpeg": MediaKind.JPEG,
    ".heic": MediaKind.JPEG,
    ".heif": MediaKind.JPEG,
    ".mov": MediaKind.VIDEO,
    ".mp4": MediaKind.VIDEO,
    ".m4v": MediaKind.VIDEO,
    ".braw": MediaKind.VIDEO,
    ".r3d": MediaKind.VIDEO,
    ".mxf": MediaKind.VIDEO,
    ".wav": MediaKind.AUDIO,
    ".aif": MediaKind.AUDIO,
    ".aiff": MediaKind.AUDIO,
    ".xmp": MediaKind.SIDECAR,
}

TRANSFER_MODES = {"copy", "move_after_verify"}


@dataclass(frozen=True)
class IngestOptions:
    shoot_name: str
    destination_root: Path
    shoot_date: str = "2026-05-06"
    transfer_mode: str = "copy"

    def __post_init__(self) -> None:
        if not self.shoot_name.strip():
            raise ValueError("shoot_name must not be blank")
        if not self.destination_root.is_absolute():
            raise ValueError("destination_root must be an absolute path")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", self.shoot_date):
            raise ValueError("shoot_date must use YYYY-MM-DD format")
        if self.transfer_mode not in TRANSFER_MODES:
            raise ValueError(f"transfer_mode must be one of {sorted(TRANSFER_MODES)}")


@dataclass(frozen=True)
class IngestOperation:
    action: str
    source: Path
    destination: Path
    sha256: str | None = None


@dataclass(frozen=True)
class ManifestItem:
    source: Path
    destination: Path
    kind: MediaKind
    size_bytes: int
    sha256: str


@dataclass(frozen=True)
class IngestManifest:
    items: tuple[ManifestItem, ...]


@dataclass(frozen=True)
class IngestSummary:
    total_files: int
    total_bytes: int
    by_kind: dict[MediaKind, int] = field(default_factory=dict)


@dataclass(frozen=True)
class IngestPlan:
    operations: tuple[IngestOperation, ...]
    manifest: IngestManifest
    summary: IngestSummary
    warnings: tuple[str, ...] = ()
    ignored: tuple[str, ...] = ()
    requires_source_deletion: bool = False


def plan_ingest(
    *,
    source_files: dict[Path, bytes],
    existing_destinations: set[Path],
    options: IngestOptions,
) -> IngestPlan:
    operations: list[IngestOperation] = []
    manifest_items: list[ManifestItem] = []
    warnings: list[str] = []
    ignored: list[str] = []
    claimed_destinations = set(existing_destinations)
    by_kind: dict[MediaKind, int] = {}
    total_bytes = 0

    for source, content in sorted(source_files.items(), key=lambda item: str(item[0])):
        kind = classify_media(source)
        if kind is None:
            ignored.append(f"Ignored non-media file: {source.name}")
            continue

        digest = sha256(content).hexdigest()
        destination = _next_available_destination(
            _destination_for(source, kind, options),
            claimed_destinations,
        )
        if destination.name != source.name:
            warnings.append(
                f"Destination collision for {source.name}; planned {destination.name} instead."
            )
        claimed_destinations.add(destination)

        operations.append(
            IngestOperation(
                action="copy",
                source=source,
                destination=destination,
                sha256=digest,
            )
        )
        if options.transfer_mode == "move_after_verify":
            operations.append(
                IngestOperation(
                    action="quarantine",
                    source=source,
                    destination=_quarantine_destination(source),
                    sha256=digest,
                )
            )

        manifest_items.append(
            ManifestItem(
                source=source,
                destination=destination,
                kind=kind,
                size_bytes=len(content),
                sha256=digest,
            )
        )
        by_kind[kind] = by_kind.get(kind, 0) + 1
        total_bytes += len(content)

    return IngestPlan(
        operations=tuple(operations),
        manifest=IngestManifest(items=tuple(manifest_items)),
        summary=IngestSummary(
            total_files=len(manifest_items),
            total_bytes=total_bytes,
            by_kind=by_kind,
        ),
        warnings=tuple(warnings),
        ignored=tuple(ignored),
    )


def classify_media(path: Path) -> MediaKind | None:
    return MEDIA_EXTENSIONS.get(path.suffix.lower())


def _destination_for(source: Path, kind: MediaKind, options: IngestOptions) -> Path:
    return options.destination_root / _shoot_slug(options) / kind.value / source.name


def _shoot_slug(options: IngestOptions) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", options.shoot_name.lower()).strip("-")
    return f"{options.shoot_date}-{normalized}"


def _next_available_destination(candidate: Path, claimed_destinations: set[Path]) -> Path:
    if candidate not in claimed_destinations:
        return candidate

    counter = 1
    while True:
        versioned = candidate.with_name(f"{candidate.stem}-{counter}{candidate.suffix}")
        if versioned not in claimed_destinations:
            return versioned
        counter += 1


def _quarantine_destination(source: Path) -> Path:
    card_root = _volume_root(source)
    return card_root / ".media-automation-quarantine" / source.name


def _volume_root(source: Path) -> Path:
    parts = source.parts
    if len(parts) >= 3 and parts[0] == "/" and parts[1] == "Volumes":
        return Path("/", "Volumes", parts[2])
    if source.anchor:
        return Path(source.anchor)
    return source.parent
