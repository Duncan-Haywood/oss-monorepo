"""Plan safe media imports from removable cards into a local archive.

This module deliberately plans operations instead of executing them. The app
should show, persist, and verify a plan before any destructive source cleanup.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path


class ImportMode(StrEnum):
    COPY = "copy"
    MOVE = "move"


@dataclass(frozen=True)
class ImportOperation:
    source: Path
    destination: Path
    checksum: str
    byte_count: int
    preserve_source: bool


@dataclass(frozen=True)
class Duplicate:
    source: Path
    destination: Path
    checksum: str


@dataclass(frozen=True)
class MediaGroup:
    key: str
    files: frozenset[Path]


@dataclass(frozen=True)
class ImportPlan:
    mode: ImportMode
    source_root: Path
    destination_root: Path
    shoot_directory: Path
    operations: tuple[ImportOperation, ...]
    skipped_duplicates: tuple[Duplicate, ...]
    groups: tuple[MediaGroup, ...]
    warnings: tuple[str, ...]


class ImportPlanner:
    """Create non-destructive import plans for photo and video shoots."""

    DEFAULT_MEDIA_EXTENSIONS = frozenset(
        {
            ".3fr",
            ".ari",
            ".arw",
            ".braw",
            ".cin",
            ".cr2",
            ".cr3",
            ".dng",
            ".erf",
            ".fff",
            ".heic",
            ".heif",
            ".jpeg",
            ".jpg",
            ".m4v",
            ".mef",
            ".mov",
            ".mp4",
            ".mts",
            ".nef",
            ".orf",
            ".pef",
            ".raf",
            ".raw",
            ".rw2",
            ".srw",
            ".tif",
            ".tiff",
            ".xmp",
        }
    )

    def __init__(self, media_extensions: set[str] | frozenset[str] | None = None) -> None:
        extensions = media_extensions or self.DEFAULT_MEDIA_EXTENSIONS
        self._media_extensions = frozenset(extension.lower() for extension in extensions)

    def plan(
        self,
        source_root: Path,
        destination_root: Path,
        *,
        shoot_name: str,
        mode: ImportMode = ImportMode.COPY,
        verified_copy: bool = False,
        delete_after_copy: bool = False,
    ) -> ImportPlan:
        mode = ImportMode(mode)
        source_root = source_root.expanduser().resolve()
        destination_root = destination_root.expanduser().resolve()
        shoot_directory = destination_root / self._safe_shoot_name(shoot_name)

        if not source_root.exists():
            raise FileNotFoundError(f"Source does not exist: {source_root}")
        if not source_root.is_dir():
            raise NotADirectoryError(f"Source is not a directory: {source_root}")
        if destination_root == source_root or destination_root.is_relative_to(source_root):
            raise ValueError("Destination archive must be outside the source tree")
        if mode is ImportMode.MOVE and not verified_copy:
            raise ValueError("Move mode requires a verified copy before deleting sources")
        if mode is ImportMode.MOVE and not delete_after_copy:
            raise ValueError("Move mode requires explicit delete intent")

        warnings: list[str] = []
        if mode is ImportMode.MOVE:
            warnings.append("move cleanup must be planned separately after checksum verification")

        operations: list[ImportOperation] = []
        skipped_duplicates: list[Duplicate] = []
        planned_destinations: dict[Path, str] = {}

        for source in self._discover_media(source_root, warnings):
            checksum = _sha256(source)
            byte_count = source.stat().st_size
            destination = self._resolve_destination(
                destination_root,
                shoot_directory,
                source.name,
                checksum,
                planned_destinations,
            )

            if planned_destinations.get(destination) == checksum:
                skipped_duplicates.append(Duplicate(source=source, destination=destination, checksum=checksum))
                continue
            if destination.exists() and _sha256(destination) == checksum:
                skipped_duplicates.append(Duplicate(source=source, destination=destination, checksum=checksum))
                continue

            planned_destinations[destination] = checksum
            operations.append(
                ImportOperation(
                    source=source,
                    destination=destination,
                    checksum=checksum,
                    byte_count=byte_count,
                    preserve_source=True,
                )
            )

        return ImportPlan(
            mode=mode,
            source_root=source_root,
            destination_root=destination_root,
            shoot_directory=shoot_directory,
            operations=tuple(operations),
            skipped_duplicates=tuple(skipped_duplicates),
            groups=self._group_sidecars(source_root, (operation.source for operation in operations)),
            warnings=tuple(warnings),
        )

    def _discover_media(self, source_root: Path, warnings: list[str]) -> tuple[Path, ...]:
        files: list[Path] = []
        for path in source_root.rglob("*"):
            if _is_hidden(path, source_root):
                continue
            if path.is_symlink():
                if path.suffix.lower() in self._media_extensions:
                    warnings.append(f"Skipped symlinked source: {path}")
                continue
            if path.is_file() and path.suffix.lower() in self._media_extensions:
                files.append(path)
        return tuple(sorted(files, key=lambda path: path.relative_to(source_root).as_posix().lower()))

    def _resolve_destination(
        self,
        destination_root: Path,
        shoot_directory: Path,
        filename: str,
        checksum: str,
        planned_destinations: dict[Path, str],
    ) -> Path:
        candidate = shoot_directory / filename
        _reject_unsafe_destination_path(destination_root, candidate)
        if _destination_available(candidate, checksum, planned_destinations):
            return candidate

        stem = candidate.stem
        suffix = candidate.suffix
        index = 1
        while True:
            numbered = candidate.with_name(f"{stem}-{index}{suffix}")
            _reject_unsafe_destination_path(destination_root, numbered)
            if _destination_available(numbered, checksum, planned_destinations):
                return numbered
            index += 1

    def _group_sidecars(self, source_root: Path, files: Iterable[Path]) -> tuple[MediaGroup, ...]:
        groups: dict[str, set[Path]] = {}
        for file in files:
            relative_parent = file.parent.relative_to(source_root).as_posix().lower()
            key = f"{relative_parent}/{file.with_suffix('').name.lower()}"
            groups.setdefault(key, set()).add(file)

        return tuple(
            MediaGroup(key=key, files=frozenset(files))
            for key, files in sorted(groups.items())
            if len(files) > 1
        )

    def _safe_shoot_name(self, shoot_name: str) -> str:
        cleaned = re.sub(r"[\\/:\0]+", "-", shoot_name.strip())
        cleaned = re.sub(r"\s+", " ", cleaned)
        if cleaned in {"", ".", ".."}:
            raise ValueError("Shoot name must contain at least one safe character")
        return cleaned


def _destination_available(destination: Path, checksum: str, planned_destinations: dict[Path, str]) -> bool:
    planned_checksum = planned_destinations.get(destination)
    if planned_checksum is not None:
        return planned_checksum == checksum
    if not destination.exists():
        return True
    return destination.is_file() and _sha256(destination) == checksum


def _reject_unsafe_destination_path(destination_root: Path, destination: Path) -> None:
    relative = destination.relative_to(destination_root)
    current = destination_root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError(f"Destination path contains a symlink: {current}")
        if current != destination and current.exists() and not current.is_dir():
            raise ValueError(f"Destination path parent is not a directory: {current}")


def _is_hidden(path: Path, source_root: Path) -> bool:
    return any(part.startswith(".") for part in path.relative_to(source_root).parts)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
