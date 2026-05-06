from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal


MediaKind = Literal["photo", "raw_photo", "video", "camera_log"]
COPY_CHUNK_SIZE_BYTES = 1024 * 1024
MEDIA_KINDS: tuple[MediaKind, ...] = ("photo", "raw_photo", "video", "camera_log")

RAW_PHOTO_EXTENSIONS = {
    ".3fr",
    ".arw",
    ".cr2",
    ".cr3",
    ".dng",
    ".nef",
    ".orf",
    ".raf",
    ".rw2",
}
PHOTO_EXTENSIONS = {".avif", ".heic", ".heif", ".jpeg", ".jpg", ".png", ".tif", ".tiff"}
VIDEO_EXTENSIONS = {".avi", ".m4v", ".mov", ".mp4", ".mxf", ".r3d"}
CAMERA_LOG_EXTENSIONS = {".csv", ".edl", ".log", ".xmp"}


@dataclass(frozen=True)
class IngestItem:
    source: Path
    destination: Path
    media_kind: MediaKind
    size_bytes: int
    safety_action: Literal["copy"]

    def to_manifest_entry(self) -> dict[str, object]:
        return {
            "source": str(self.source),
            "destination": str(self.destination),
            "media_kind": self.media_kind,
            "size_bytes": self.size_bytes,
            "safety_action": self.safety_action,
            "delete_source": False,
        }


@dataclass(frozen=True)
class IngestPlan:
    source_root: Path
    library_root: Path
    shoot_name: str
    items: tuple[IngestItem, ...]
    summary: dict[str, int]

    def to_manifest(self) -> dict[str, object]:
        return {
            "source_root": str(self.source_root),
            "library_root": str(self.library_root),
            "shoot_name": self.shoot_name,
            "delete_source": False,
            "summary": self.summary,
            "items": [item.to_manifest_entry() for item in self.items],
        }

    def write_manifest(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("x", encoding="utf-8") as file:
            file.write(json.dumps(self.to_manifest(), indent=2, sort_keys=True) + "\n")


def execute_ingest_plan(plan: IngestPlan) -> dict[str, object]:
    copied = 0
    failed = 0
    failures: list[dict[str, str]] = []

    for item in plan.items:
        try:
            copy_file_exclusive(item.source, item.destination)
            copied += 1
        except OSError as error:
            failed += 1
            failures.append(
                {
                    "source": str(item.source),
                    "destination": str(item.destination),
                    "error": str(error),
                }
            )

    return {
        "copied": copied,
        "failed": failed,
        "failures": failures,
        "delete_source": False,
    }


def build_ingest_plan(source_root: Path, library_root: Path, *, shoot_name: str) -> IngestPlan:
    source = source_root.expanduser().resolve()
    library = library_root.expanduser().resolve()
    if not source.exists():
        raise FileNotFoundError(f"Source path does not exist: {source}")
    if not source.is_dir():
        raise NotADirectoryError(f"Source path is not a directory: {source}")
    if not shoot_name.strip():
        raise ValueError("shoot_name must not be blank")

    shoot_slug = slugify(shoot_name)
    ignored_files = 0
    items: list[IngestItem] = []
    planned_destinations: set[Path] = set()

    for source_file in iter_files(source):
        media_kind = classify_media(source_file)
        if media_kind is None:
            ignored_files += 1
            continue

        destination_dir = library / shoot_slug / media_kind
        destination = unique_destination(destination_dir / source_file.name, source_file, planned_destinations)
        planned_destinations.add(destination)
        items.append(
            IngestItem(
                source=source_file,
                destination=destination,
                media_kind=media_kind,
                size_bytes=source_file.stat().st_size,
                safety_action="copy",
            )
        )

    items.sort(key=lambda item: (item.media_kind, item.source.name.lower(), str(item.source)))
    summary = {
        "total_items": len(items),
        "ignored_files": ignored_files,
    }
    for media_kind in MEDIA_KINDS:
        summary[media_kind] = sum(1 for item in items if item.media_kind == media_kind)
    return IngestPlan(
        source_root=source,
        library_root=library,
        shoot_name=shoot_name,
        items=tuple(items),
        summary=summary,
    )


def classify_media(path: Path) -> MediaKind | None:
    extension = path.suffix.lower()
    if extension in RAW_PHOTO_EXTENSIONS:
        return "raw_photo"
    if extension in PHOTO_EXTENSIONS:
        return "photo"
    if extension in VIDEO_EXTENSIONS:
        return "video"
    if extension in CAMERA_LOG_EXTENSIONS:
        return "camera_log"
    return None


def iter_files(root: Path) -> Iterable[Path]:
    for current_root, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for filename in sorted(filenames):
            path = Path(current_root) / filename
            yield path


def slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return normalized.strip("-") or "shoot"


def unique_destination(candidate: Path, source_file: Path, planned_destinations: set[Path]) -> Path:
    if candidate not in planned_destinations and not candidate.exists():
        return candidate

    suffix = destination_fingerprint(source_file)[:8]
    attempt = 1
    while True:
        attempt_suffix = suffix if attempt == 1 else f"{suffix}-{attempt}"
        destination = candidate.with_name(f"{candidate.stem}-{attempt_suffix}{candidate.suffix}")
        if destination not in planned_destinations and not destination.exists():
            return destination
        attempt += 1


def copy_file_exclusive(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_path = create_temp_path(destination)
    try:
        source_hash = copy_with_hash(source, temp_path)
        shutil.copystat(source, temp_path)
        if source_hash != content_hash(temp_path):
            raise IOError(f"Checksum verification failed for {source}")
        os.link(temp_path, destination)
    finally:
        temp_path.unlink(missing_ok=True)


def create_temp_path(destination: Path) -> Path:
    descriptor, temp_name = tempfile.mkstemp(
        prefix=f".{destination.name}.",
        suffix=".tmp",
        dir=destination.parent,
    )
    os.close(descriptor)
    return Path(temp_name)


def copy_with_hash(source: Path, destination: Path) -> str:
    digest = hashlib.sha256()
    with source.open("rb") as source_file, destination.open("wb") as destination_file:
        while True:
            chunk = source_file.read(COPY_CHUNK_SIZE_BYTES)
            if not chunk:
                break
            digest.update(chunk)
            destination_file.write(chunk)
    return digest.hexdigest()


def destination_fingerprint(path: Path) -> str:
    stat = path.stat()
    identity = f"{path.resolve()}:{stat.st_size}:{stat.st_mtime_ns}"
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


def content_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(COPY_CHUNK_SIZE_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()
