from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Iterable
from uuid import uuid4

from media_tool.media_types import MediaKind, classify_extension


HIDDEN_OR_SYSTEM_PREFIXES = (".",)
SAFE_SHOOT_SLUG = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
SYSTEM_DIRECTORY_NAMES = {
    "$recycle.bin",
    ".fseventsd",
    ".spotlight-v100",
    ".temporaryitems",
    ".trashes",
    "system volume information",
}


@dataclass(frozen=True)
class MediaAsset:
    source: Path
    relative_path: Path
    kind: MediaKind
    size_bytes: int
    modified_at: float


@dataclass(frozen=True)
class PlannedCopy:
    asset: MediaAsset
    destination: Path


@dataclass(frozen=True)
class IngestPlan:
    source: Path
    library: Path
    shoot_slug: str
    copies: tuple[PlannedCopy, ...]

    @property
    def shoot_root(self) -> Path:
        return self.library / self.shoot_slug

    @property
    def manifest_directory(self) -> Path:
        return self.shoot_root / "manifests"


@dataclass(frozen=True)
class CopyResult:
    source: Path
    destination: Path
    media_kind: MediaKind
    size_bytes: int
    source_checksum: str
    destination_checksum: str
    status: str

    def to_json(self) -> dict[str, str | int]:
        return {
            "source": str(self.source),
            "destination": str(self.destination),
            "media_kind": self.media_kind.value,
            "size_bytes": self.size_bytes,
            "source_checksum": self.source_checksum,
            "destination_checksum": self.destination_checksum,
            "status": self.status,
        }


@dataclass(frozen=True)
class IngestManifest:
    manifest_path: Path
    source: Path
    library: Path
    shoot_slug: str
    generated_at: str
    results: tuple[CopyResult, ...]

    def to_json(self) -> dict[str, object]:
        return {
            "manifest_path": str(self.manifest_path),
            "source": str(self.source),
            "library": str(self.library),
            "shoot_slug": self.shoot_slug,
            "generated_at": self.generated_at,
            "results": [result.to_json() for result in self.results],
        }


def build_ingest_plan(source: str | Path, library: str | Path, shoot_slug: str) -> IngestPlan:
    source_path = Path(source).expanduser().resolve()
    library_path = Path(library).expanduser().resolve()
    safe_shoot_slug = validate_shoot_slug(shoot_slug)
    if not source_path.exists():
        raise FileNotFoundError(f"Source does not exist: {source_path}")
    if not source_path.is_dir():
        raise NotADirectoryError(f"Source must be a directory: {source_path}")
    if library_path.exists() and not library_path.is_dir():
        raise NotADirectoryError(f"Library must be a directory: {library_path}")
    if _is_relative_to(library_path, source_path):
        raise ValueError("Library must not be inside the source folder being scanned")

    assets = tuple(_scan_assets(source_path))
    planned: list[PlannedCopy] = []
    used_destinations: set[Path] = set()
    for asset in assets:
        destination = _destination_for_asset(library_path, safe_shoot_slug, asset)
        destination = _available_destination(destination, asset, used_destinations)
        _ensure_safe_output_path(destination, library_path)
        used_destinations.add(destination)
        planned.append(PlannedCopy(asset=asset, destination=destination))

    return IngestPlan(
        source=source_path,
        library=library_path,
        shoot_slug=safe_shoot_slug,
        copies=tuple(planned),
    )


def execute_ingest_plan(plan: IngestPlan) -> IngestManifest:
    for copy in plan.copies:
        _ensure_safe_output_path(copy.destination, plan.library)
    results = tuple(_copy_asset(copy) for copy in plan.copies)
    manifest_path = _new_manifest_path(plan)
    _ensure_safe_output_path(manifest_path, plan.library)
    manifest = IngestManifest(
        manifest_path=manifest_path,
        source=plan.source,
        library=plan.library,
        shoot_slug=plan.shoot_slug,
        generated_at=datetime.now(UTC).isoformat(),
        results=results,
    )
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open("x", encoding="utf-8") as handle:
        json.dump(manifest.to_json(), handle, indent=2, sort_keys=True)
        handle.write("\n")
    return manifest


def validate_shoot_slug(shoot_slug: str) -> str:
    if shoot_slug != shoot_slug.strip():
        raise ValueError("shoot_slug must not have leading or trailing whitespace")
    if not shoot_slug:
        raise ValueError("shoot_slug must not be empty")
    slug_path = Path(shoot_slug)
    if slug_path.is_absolute() or len(slug_path.parts) != 1:
        raise ValueError("shoot_slug must be a single safe path component")
    if shoot_slug in {".", ".."} or not SAFE_SHOOT_SLUG.fullmatch(shoot_slug):
        raise ValueError("shoot_slug may only contain letters, numbers, dots, underscores, and hyphens")
    return shoot_slug


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _scan_assets(source: Path) -> Iterable[MediaAsset]:
    for path in sorted(source.rglob("*")):
        if _should_skip(path, source):
            continue
        if path.is_symlink():
            continue
        if not path.is_file():
            continue
        kind = classify_extension(path.suffix)
        if kind is None:
            continue
        stat = path.stat()
        yield MediaAsset(
            source=path,
            relative_path=path.relative_to(source),
            kind=kind,
            size_bytes=stat.st_size,
            modified_at=stat.st_mtime,
        )


def _should_skip(path: Path, source: Path) -> bool:
    try:
        relative_parts = path.relative_to(source).parts
    except ValueError:
        return True
    for part in relative_parts:
        lowered = part.lower()
        if lowered in SYSTEM_DIRECTORY_NAMES:
            return True
        if part.startswith(HIDDEN_OR_SYSTEM_PREFIXES):
            return True
    return False


def _destination_for_asset(library: Path, shoot_slug: str, asset: MediaAsset) -> Path:
    return library / shoot_slug / "originals" / asset.kind.value / asset.relative_path


def _available_destination(destination: Path, asset: MediaAsset, used_destinations: set[Path]) -> Path:
    candidate = destination
    while True:
        if candidate in used_destinations:
            candidate = _collision_destination(candidate, asset.relative_path)
            continue
        if candidate.is_symlink():
            raise ValueError(f"Refusing to use symlinked destination: {candidate}")
        if not candidate.exists():
            return candidate
        if not candidate.is_file():
            candidate = _collision_destination(candidate, asset.relative_path)
            continue
        if sha256_file(candidate) == sha256_file(asset.source):
            return candidate
        candidate = _collision_destination(candidate, asset.relative_path)


def _collision_destination(destination: Path, relative_path: Path) -> Path:
    source_hash = hashlib.sha1(str(relative_path).encode("utf-8")).hexdigest()[:8]
    return destination.with_name(f"{destination.stem}-{source_hash}{destination.suffix}")


def _copy_asset(copy: PlannedCopy) -> CopyResult:
    source_checksum = sha256_file(copy.asset.source)

    if copy.destination.exists():
        if copy.destination.is_symlink():
            raise ValueError(f"Refusing to overwrite symlinked destination: {copy.destination}")
        if not copy.destination.is_file():
            raise FileExistsError(f"Destination exists and is not a file: {copy.destination}")
        destination_checksum = sha256_file(copy.destination)
        if destination_checksum == source_checksum:
            return CopyResult(
                source=copy.asset.source,
                destination=copy.destination,
                media_kind=copy.asset.kind,
                size_bytes=copy.asset.size_bytes,
                source_checksum=source_checksum,
                destination_checksum=destination_checksum,
                status="already_copied",
            )
        raise FileExistsError(
            f"Destination exists with different checksum; refusing to overwrite: {copy.destination}"
        )

    copy.destination.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(prefix=f".{copy.destination.name}.", dir=copy.destination.parent, delete=False) as temp:
        temp_path = Path(temp.name)
    try:
        shutil.copy2(copy.asset.source, temp_path)
        destination_checksum = sha256_file(temp_path)
        if destination_checksum != source_checksum:
            raise IOError(f"Checksum mismatch while copying {copy.asset.source} to {copy.destination}")
        os.link(temp_path, copy.destination)
        destination_checksum = sha256_file(copy.destination)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise
    temp_path.unlink(missing_ok=True)

    return CopyResult(
        source=copy.asset.source,
        destination=copy.destination,
        media_kind=copy.asset.kind,
        size_bytes=copy.asset.size_bytes,
        source_checksum=source_checksum,
        destination_checksum=destination_checksum,
        status="copied",
    )


def _new_manifest_path(plan: IngestPlan) -> Path:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
    return plan.manifest_directory / f"ingest-manifest-{timestamp}-{uuid4().hex[:8]}.json"


def _ensure_safe_output_path(path: Path, library: Path) -> None:
    resolved_library = library.resolve()
    resolved_path = path.resolve(strict=False)
    if not _is_relative_to(resolved_path, resolved_library):
        raise ValueError(f"Output path escapes library: {path}")

    current = resolved_library
    relative_parts = path.relative_to(library).parts
    for part in relative_parts[:-1]:
        current = current / part
        if current.is_symlink():
            raise ValueError(f"Refusing to write through symlinked directory: {current}")
    if path.is_symlink():
        raise ValueError(f"Refusing to write symlinked output path: {path}")


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True
