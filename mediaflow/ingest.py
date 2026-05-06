from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Literal

MediaKind = Literal["photo", "raw", "video", "sidecar"]
IngestMode = Literal["copy", "move"]
SourceKind = Literal["local", "removable"]

PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff"}
RAW_EXTENSIONS = {
    ".3fr",
    ".arw",
    ".cr2",
    ".cr3",
    ".dng",
    ".erf",
    ".gpr",
    ".nef",
    ".orf",
    ".raf",
    ".raw",
    ".rw2",
    ".srw",
}
VIDEO_EXTENSIONS = {".avi", ".m4v", ".mov", ".mp4", ".mxf", ".r3d"}
SIDECAR_EXTENSIONS = {".aae", ".cos", ".dop", ".lrv", ".thm", ".xmp"}

DESTINATION_FOLDERS: dict[MediaKind, str] = {
    "photo": "photos",
    "raw": "raw",
    "video": "videos",
    "sidecar": "sidecars",
}


class SafetyError(ValueError):
    """Raised when an ingest request could destroy originals unexpectedly."""


@dataclass(frozen=True)
class IngestOptions:
    mode: IngestMode = "copy"
    source_kind: SourceKind = "local"
    allow_source_removal: bool = False


@dataclass(frozen=True)
class IngestOperation:
    source: Path
    destination: Path
    media_kind: MediaKind
    sha256: str
    bytes: int


@dataclass(frozen=True)
class IngestPlan:
    source: Path
    destination: Path
    options: IngestOptions
    operations: tuple[IngestOperation, ...]


@dataclass(frozen=True)
class MediaSourceCandidate:
    path: Path
    media_count: int
    confidence: float
    reasons: tuple[str, ...]


def classify_media(path: Path) -> MediaKind | None:
    extension = path.suffix.lower()
    if extension in RAW_EXTENSIONS:
        return "raw"
    if extension in PHOTO_EXTENSIONS:
        return "photo"
    if extension in VIDEO_EXTENSIONS:
        return "video"
    if extension in SIDECAR_EXTENSIONS:
        return "sidecar"
    return None


def plan_ingest(source: Path, destination: Path, options: IngestOptions) -> IngestPlan:
    source = source.expanduser().resolve()
    destination = destination.expanduser().resolve()
    _validate_options(source, destination, options)

    used_destinations: set[Path] = set()
    operations: list[IngestOperation] = []

    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue

        media_kind = classify_media(path)
        if media_kind is None:
            continue

        digest = _sha256(path)
        capture_day = _capture_day(path)
        target_dir = (
            destination
            / capture_day.strftime("%Y")
            / capture_day.isoformat()
            / DESTINATION_FOLDERS[media_kind]
        )
        target = _collision_safe_path(target_dir / path.name, digest, used_destinations)
        used_destinations.add(target)
        operations.append(
            IngestOperation(
                source=path,
                destination=target,
                media_kind=media_kind,
                sha256=digest,
                bytes=path.stat().st_size,
            )
        )

    return IngestPlan(source=source, destination=destination, options=options, operations=tuple(operations))


def detect_media_sources(roots: Iterable[Path]) -> list[MediaSourceCandidate]:
    candidates: list[MediaSourceCandidate] = []

    for root in roots:
        root = root.expanduser().resolve()
        if not root.exists() or not root.is_dir():
            continue

        for candidate_root in _candidate_roots(root):
            media_count = _count_media_files(candidate_root)
            if media_count == 0:
                continue

            confidence, reasons = _score_media_source(candidate_root, media_count)
            candidates.append(
                MediaSourceCandidate(
                    path=candidate_root,
                    media_count=media_count,
                    confidence=confidence,
                    reasons=tuple(reasons),
                )
            )

    return sorted(candidates, key=lambda candidate: (-candidate.confidence, str(candidate.path)))


def execute_plan(plan: IngestPlan) -> Path:
    manifest_operations: list[dict[str, object]] = []

    for operation in plan.operations:
        operation.destination.parent.mkdir(parents=True, exist_ok=True)
        if operation.destination.exists():
            existing_digest = _sha256(operation.destination)
            if existing_digest != operation.sha256:
                raise SafetyError(f"Destination already exists with different content: {operation.destination}")
        else:
            shutil.copy2(operation.source, operation.destination)

        copied_digest = _sha256(operation.destination)
        if copied_digest != operation.sha256:
            raise SafetyError(f"Verification failed after copying: {operation.source}")

        manifest_operations.append(_operation_to_manifest(operation))

    if plan.options.mode == "move":
        if not plan.options.allow_source_removal:
            raise SafetyError("Move execution requires allow_source_removal=True")
        for operation in plan.operations:
            operation.source.unlink()

    manifest_dir = plan.destination / "_manifests"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    created_at = datetime.now(timezone.utc)
    manifest_path = _unique_manifest_path(manifest_dir, created_at)
    manifest_path.write_text(
        json.dumps(
            {
                "created_at": created_at.isoformat(),
                "mode": plan.options.mode,
                "source": str(plan.source),
                "destination": str(plan.destination),
                "operation_count": len(plan.operations),
                "operations": manifest_operations,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )
    return manifest_path


def _validate_options(source: Path, destination: Path, options: IngestOptions) -> None:
    if options.mode not in {"copy", "move"}:
        raise ValueError(f"Unsupported ingest mode: {options.mode}")
    if options.source_kind not in {"local", "removable"}:
        raise ValueError(f"Unsupported source kind: {options.source_kind}")
    if not source.exists() or not source.is_dir():
        raise FileNotFoundError(f"Source directory does not exist: {source}")
    if source == destination:
        raise SafetyError("Source and destination must be different directories")
    if destination.is_relative_to(source):
        raise SafetyError("Destination cannot be inside the source tree")
    if options.mode == "move" and not options.allow_source_removal:
        raise SafetyError("Moving media requires explicit source-removal consent")


def _capture_day(path: Path) -> datetime.date:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).date()


def _candidate_roots(root: Path) -> list[Path]:
    if (root / "DCIM").exists():
        return [root]
    children = [child for child in root.iterdir() if child.is_dir()]
    return children or [root]


def _count_media_files(root: Path, limit: int = 2_000) -> int:
    count = 0
    for path in root.rglob("*"):
        if not path.is_file() or classify_media(path) is None:
            continue
        count += 1
        if count >= limit:
            return count
    return count


def _score_media_source(root: Path, media_count: int) -> tuple[float, list[str]]:
    reasons: list[str] = []
    confidence = min(0.45, media_count / 10)
    reasons.append(f"{media_count} media files")

    if (root / "DCIM").exists():
        confidence += 0.4
        reasons.append("contains DCIM")

    camera_names = ("EOS", "NIKON", "SONY", "FUJI", "LUMIX", "LEICA", "CANON", "PRIVATE")
    upper_name = root.name.upper()
    if any(name in upper_name for name in camera_names):
        confidence += 0.2
        reasons.append("camera-like volume name")

    return min(confidence, 1.0), reasons


def _collision_safe_path(path: Path, digest: str, used_destinations: set[Path]) -> Path:
    if path not in used_destinations and (not path.exists() or _sha256(path) == digest):
        return path

    candidate = path.with_name(f"{path.stem}-{digest[:10]}{path.suffix}")
    counter = 2
    while candidate in used_destinations or (candidate.exists() and _sha256(candidate) != digest):
        candidate = path.with_name(f"{path.stem}-{digest[:10]}-{counter}{path.suffix}")
        counter += 1
    return candidate


def _unique_manifest_path(manifest_dir: Path, created_at: datetime) -> Path:
    timestamp = created_at.strftime("%Y%m%dT%H%M%S%fZ")
    candidate = manifest_dir / f"ingest-{timestamp}.json"
    counter = 2
    while candidate.exists():
        candidate = manifest_dir / f"ingest-{timestamp}-{counter}.json"
        counter += 1
    return candidate


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _operation_to_manifest(operation: IngestOperation) -> dict[str, object]:
    return {
        "source": str(operation.source),
        "destination": str(operation.destination),
        "media_kind": operation.media_kind,
        "sha256": operation.sha256,
        "bytes": operation.bytes,
    }
