from __future__ import annotations

import hashlib
import json
import os
import shutil
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Iterable


class MediaKind(StrEnum):
    RAW = "raw"
    PHOTO = "photo"
    VIDEO = "video"
    SIDECAR = "sidecar"


class IngestStatus(StrEnum):
    PENDING_COPY = "pending_copy"
    SKIP_EXISTING_IDENTICAL = "skip_existing_identical"
    CONFLICT_EXISTING_DIFFERENT = "conflict_existing_different"


@dataclass(frozen=True)
class IngestPolicy:
    shoot_slug: str
    shoot_date: str | None = None


@dataclass(frozen=True)
class IngestOperation:
    source: Path
    destination: Path
    kind: MediaKind
    status: IngestStatus
    byte_count: int
    sha256: str
    reason: str | None = None

    @property
    def source_path(self) -> Path:
        return self.source

    @property
    def destination_path(self) -> Path:
        return self.destination


@dataclass(frozen=True)
class IngestPlan:
    source_root: Path
    destination_root: Path
    shoot_root: Path
    manifest_path: Path
    operations: tuple[IngestOperation, ...]
    delete_operations: tuple[Path, ...] = ()

    @property
    def total_source_bytes(self) -> int:
        return sum(operation.byte_count for operation in self.operations)

    @property
    def total_bytes(self) -> int:
        return self.total_source_bytes

    @property
    def copy_operations(self) -> tuple[IngestOperation, ...]:
        return tuple(
            operation
            for operation in self.operations
            if operation.status == IngestStatus.PENDING_COPY
        )

    @property
    def skipped_existing(self) -> tuple[IngestOperation, ...]:
        return tuple(
            operation
            for operation in self.operations
            if operation.status == IngestStatus.SKIP_EXISTING_IDENTICAL
        )

    @property
    def conflicts(self) -> tuple[IngestOperation, ...]:
        return tuple(
            operation
            for operation in self.operations
            if operation.status == IngestStatus.CONFLICT_EXISTING_DIFFERENT
        )


RAW_EXTENSIONS = {
    ".3fr",
    ".arw",
    ".cr2",
    ".cr3",
    ".dng",
    ".nef",
    ".orf",
    ".raf",
    ".raw",
    ".rw2",
}
PHOTO_EXTENSIONS = {".heic", ".jpeg", ".jpg", ".png", ".tif", ".tiff"}
VIDEO_EXTENSIONS = {".m4v", ".mov", ".mp4", ".mxf"}
SIDECAR_EXTENSIONS = {".xmp"}


def build_ingest_plan(
    source_root: Path,
    destination_root: Path,
    policy: IngestPolicy | None = None,
    *,
    shoot_slug: str | None = None,
) -> IngestPlan:
    source_root = source_root.resolve()
    destination_root = destination_root.resolve()
    policy = _normalize_policy(policy, shoot_slug)
    _validate_roots(source_root, destination_root)

    shoot_root = destination_root / _shoot_directory_name(policy)
    if not _is_relative_to(shoot_root.resolve(), destination_root):
        raise ValueError("Shoot root must stay inside the destination root")
    operations = tuple(
        _operation_for_file(source_root, shoot_root, source)
        for source in _iter_media_files(source_root)
    )

    return IngestPlan(
        source_root=source_root,
        destination_root=destination_root,
        shoot_root=shoot_root,
        manifest_path=shoot_root / "ingest-manifest.json",
        operations=operations,
    )


def copy_from_plan(plan: IngestPlan) -> None:
    conflicts = plan.conflicts
    if conflicts:
        raise RuntimeError(
            f"Refusing to copy {len(conflicts)} file(s) with existing destination conflicts"
        )

    copied: list[IngestOperation] = []
    for operation in plan.copy_operations:
        _copy_operation(operation)
        copied.append(operation)

    _write_manifest(plan, copied)


def _normalize_policy(policy: IngestPolicy | None, shoot_slug: str | None) -> IngestPolicy:
    if policy is not None and shoot_slug is not None:
        raise ValueError("Pass either policy or shoot_slug, not both")
    if policy is None:
        if shoot_slug is None:
            raise ValueError("shoot_slug is required")
        policy = IngestPolicy(shoot_slug=shoot_slug)
    return IngestPolicy(
        shoot_slug=_safe_path_component(policy.shoot_slug, "shoot_slug"),
        shoot_date=_safe_path_component(policy.shoot_date, "shoot_date")
        if policy.shoot_date is not None
        else None,
    )


def _validate_roots(source_root: Path, destination_root: Path) -> None:
    if not source_root.exists() or not source_root.is_dir():
        raise ValueError(f"Source root does not exist or is not a directory: {source_root}")
    if _is_relative_to(destination_root, source_root):
        raise ValueError("Destination must not be inside the source")


def _iter_media_files(source_root: Path) -> Iterable[Path]:
    for path in sorted(source_root.rglob("*")):
        if path.is_symlink() and _media_kind(path) is not None:
            raise ValueError(f"Source symlinks require manual review: {path}")
        if path.is_file() and _media_kind(path) is not None:
            yield path


def _operation_for_file(
    source_root: Path,
    shoot_root: Path,
    source: Path,
) -> IngestOperation:
    kind = _media_kind(source)
    if kind is None:
        raise ValueError(f"Unsupported media file: {source}")

    relative_source = source.relative_to(source_root)
    destination = shoot_root / "originals" / kind.value / relative_source
    source_checksum = sha256_file(source)
    byte_count = source.stat().st_size

    symlink_parent = _first_symlink_parent(destination)
    if symlink_parent is not None:
        return IngestOperation(
            source=source,
            destination=destination,
            kind=kind,
            status=IngestStatus.CONFLICT_EXISTING_DIFFERENT,
            byte_count=byte_count,
            sha256=source_checksum,
            reason=f"Destination parent symlink requires manual review: {symlink_parent}",
        )

    if destination.is_symlink():
        return IngestOperation(
            source=source,
            destination=destination,
            kind=kind,
            status=IngestStatus.CONFLICT_EXISTING_DIFFERENT,
            byte_count=byte_count,
            sha256=source_checksum,
            reason="Destination symlink requires manual review",
        )

    if destination.exists():
        destination_checksum = sha256_file(destination)
        if destination_checksum == source_checksum:
            return IngestOperation(
                source=source,
                destination=destination,
                kind=kind,
                status=IngestStatus.SKIP_EXISTING_IDENTICAL,
                byte_count=byte_count,
                sha256=source_checksum,
                reason="destination already has identical checksum",
            )
        return IngestOperation(
            source=source,
            destination=destination,
            kind=kind,
            status=IngestStatus.CONFLICT_EXISTING_DIFFERENT,
            byte_count=byte_count,
            sha256=source_checksum,
            reason="destination exists with a different checksum",
        )

    return IngestOperation(
        source=source,
        destination=destination,
        kind=kind,
        status=IngestStatus.PENDING_COPY,
        byte_count=byte_count,
        sha256=source_checksum,
    )


def _copy_operation(operation: IngestOperation) -> None:
    symlink_parent = _first_symlink_parent(operation.destination)
    if symlink_parent is not None:
        raise RuntimeError(f"Destination parent symlink requires manual review: {symlink_parent}")
    if operation.destination.is_symlink():
        raise RuntimeError(f"Destination symlink requires manual review: {operation.destination}")
    if operation.destination.exists():
        existing_checksum = sha256_file(operation.destination)
        if existing_checksum == operation.sha256:
            return
        raise RuntimeError(f"Destination changed before copy: {operation.destination}")

    operation.destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_destination = operation.destination.with_name(
        f".{operation.destination.name}.shootflow.tmp"
    )
    if temporary_destination.is_symlink():
        raise RuntimeError(f"Temporary destination symlink requires manual review: {temporary_destination}")
    if temporary_destination.exists():
        temporary_destination.unlink()

    shutil.copy2(operation.source, temporary_destination)
    copied_checksum = sha256_file(temporary_destination)
    if copied_checksum != operation.sha256:
        temporary_destination.unlink(missing_ok=True)
        raise RuntimeError(f"Checksum verification failed for {operation.source}")

    os.replace(temporary_destination, operation.destination)


def _write_manifest(plan: IngestPlan, copied: list[IngestOperation]) -> None:
    symlink_parent = _first_symlink_parent(plan.manifest_path)
    if symlink_parent is not None:
        raise RuntimeError(f"Manifest parent symlink requires manual review: {symlink_parent}")
    if plan.manifest_path.is_symlink():
        raise RuntimeError(f"Manifest symlink requires manual review: {plan.manifest_path}")

    plan.manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "source_root": str(plan.source_root),
        "destination_root": str(plan.destination_root),
        "shoot_root": str(plan.shoot_root),
        "delete_operations": [],
        "operations": [_operation_to_json(operation) for operation in plan.operations],
        "copied": [_operation_to_json(operation) for operation in copied],
    }
    temporary_manifest = plan.manifest_path.with_suffix(f"{plan.manifest_path.suffix}.tmp")
    if temporary_manifest.is_symlink():
        raise RuntimeError(f"Temporary manifest symlink requires manual review: {temporary_manifest}")
    with temporary_manifest.open("w", encoding="utf-8") as file:
        file.write(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
        file.flush()
        os.fsync(file.fileno())
    os.replace(temporary_manifest, plan.manifest_path)


def _operation_to_json(operation: IngestOperation) -> dict[str, str | int | None]:
    return {
        "source": str(operation.source),
        "destination": str(operation.destination),
        "kind": operation.kind.value,
        "status": operation.status.value,
        "byte_count": operation.byte_count,
        "sha256": operation.sha256,
        "reason": operation.reason,
    }


def _media_kind(path: Path) -> MediaKind | None:
    extension = path.suffix.lower()
    if extension in RAW_EXTENSIONS:
        return MediaKind.RAW
    if extension in PHOTO_EXTENSIONS:
        return MediaKind.PHOTO
    if extension in VIDEO_EXTENSIONS:
        return MediaKind.VIDEO
    if extension in SIDECAR_EXTENSIONS:
        return MediaKind.SIDECAR
    return None


def _shoot_directory_name(policy: IngestPolicy) -> str:
    if policy.shoot_date:
        return f"{policy.shoot_date}_{policy.shoot_slug}"
    return policy.shoot_slug


def _safe_path_component(value: str, label: str) -> str:
    component = value.strip()
    if (
        not component
        or component in {".", ".."}
        or Path(component).name != component
        or any(ord(character) < 32 for character in component)
    ):
        raise ValueError(f"{label} must be a safe path component")
    return component


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True


def _first_symlink_parent(path: Path) -> Path | None:
    for parent in path.parents:
        if parent.is_symlink():
            return parent
    return None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
