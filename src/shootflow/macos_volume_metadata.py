from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from shootflow.storage import (
    ImportRouteRecommendation,
    StorageCandidate,
    recommend_import_route,
    recommend_import_route_with_capacity,
)


@dataclass(frozen=True)
class MacOSVolumeMetadata:
    """Native macOS volume metadata normalized for ShootFlow storage routing."""

    name: str
    mount_path: Path
    free_bytes: int
    total_bytes: int
    is_removable: bool
    is_ejectable: bool
    is_internal: bool
    is_read_only: bool
    is_network: bool
    is_system_volume: bool

    def __post_init__(self) -> None:
        if not isinstance(self.name, str) or not self.name.strip():
            raise TypeError("name must be a non-empty string")
        if not isinstance(self.mount_path, Path):
            raise TypeError("mount_path must be a Path")
        if not _is_integer(self.free_bytes):
            raise TypeError("free_bytes must be an integer")
        if self.free_bytes < 0:
            raise ValueError("free_bytes cannot be negative")
        if not _is_integer(self.total_bytes):
            raise TypeError("total_bytes must be an integer")
        if self.total_bytes < 0:
            raise ValueError("total_bytes cannot be negative")
        if self.free_bytes > self.total_bytes:
            raise ValueError("free_bytes cannot exceed total_bytes")
        for field_name in (
            "is_removable",
            "is_ejectable",
            "is_internal",
            "is_read_only",
            "is_network",
            "is_system_volume",
        ):
            if not isinstance(getattr(self, field_name), bool):
                raise TypeError(f"{field_name} must be a boolean")


def storage_candidates_from_macos_metadata(metadata_records: list[MacOSVolumeMetadata]) -> list[StorageCandidate]:
    """Convert reviewed native macOS volume records to storage candidates.

    The adapter is advisory only. It skips system, network, missing, non-directory,
    and symlinked mounts before handing candidates to the existing reviewed route
    recommendation layer.
    """

    _validate_metadata_records(metadata_records)
    candidates: list[StorageCandidate] = []
    for record in metadata_records:
        if _should_skip_metadata_record(record):
            continue
        candidates.append(
            StorageCandidate(
                name=record.name,
                path=record.mount_path,
                free_bytes=record.free_bytes,
                total_bytes=record.total_bytes,
                is_removable=record.is_removable or (record.is_ejectable and not record.is_internal),
                is_read_only=record.is_read_only,
            )
        )
    return candidates


def recommend_import_route_from_macos_metadata(
    metadata_records: list[MacOSVolumeMetadata],
    *,
    expected_import_bytes: int | None = None,
    headroom_bytes: int = 32 * 1024**3,
) -> ImportRouteRecommendation:
    """Recommend a reviewed import route from native macOS volume metadata."""

    _validate_capacity_arguments(expected_import_bytes=expected_import_bytes, headroom_bytes=headroom_bytes)
    candidates = storage_candidates_from_macos_metadata(metadata_records)
    if not candidates:
        return _empty_metadata_recommendation(capacity_gate_active=expected_import_bytes is not None)
    if expected_import_bytes is None:
        return recommend_import_route(candidates)
    return recommend_import_route_with_capacity(
        candidates,
        expected_import_bytes=expected_import_bytes,
        headroom_bytes=headroom_bytes,
    )


def _validate_metadata_records(metadata_records: list[MacOSVolumeMetadata]) -> None:
    if not isinstance(metadata_records, list):
        raise TypeError("metadata_records must be a list of MacOSVolumeMetadata objects")
    if not metadata_records:
        raise ValueError("metadata_records cannot be empty")
    for record in metadata_records:
        if not isinstance(record, MacOSVolumeMetadata):
            raise TypeError("metadata_records must contain only MacOSVolumeMetadata objects")


def _validate_capacity_arguments(*, expected_import_bytes: int | None, headroom_bytes: int) -> None:
    if not _is_integer(headroom_bytes):
        raise TypeError("headroom_bytes must be an integer")
    if headroom_bytes < 0:
        raise ValueError("headroom_bytes cannot be negative")
    if expected_import_bytes is not None:
        if not _is_integer(expected_import_bytes):
            raise TypeError("expected_import_bytes must be an integer")
        if expected_import_bytes <= 0:
            raise ValueError("expected_import_bytes must be greater than zero")


def _should_skip_metadata_record(record: MacOSVolumeMetadata) -> bool:
    if record.is_system_volume or record.is_network:
        return True
    if _path_has_symlink_component(record.mount_path):
        return True
    if not record.mount_path.exists() or not record.mount_path.is_dir():
        return True
    return False


def _is_integer(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _path_has_symlink_component(path: Path) -> bool:
    return any(component.is_symlink() for component in (path, *path.parents))


def _empty_metadata_recommendation(*, capacity_gate_active: bool) -> ImportRouteRecommendation:
    notes = [
        "review source and destination before importing",
        "source media will not be deleted",
        "copy must be verified by checksum manifest",
        "eject cards only after manifest review and backup verification",
        "no usable macOS volume metadata records found",
    ]
    if capacity_gate_active:
        notes.append("capacity gate active: no destination candidate was available to validate free space")
    return ImportRouteRecommendation(
        source=None,
        destination=None,
        status="blocked",
        ready=False,
        review_required=True,
        safety_notes=tuple(notes),
    )
