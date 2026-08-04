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
    """Native macOS volume facts supplied by a future Swift/Disk Arbitration shell."""

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
        _validate_bytes("free_bytes", self.free_bytes)
        _validate_bytes("total_bytes", self.total_bytes)
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


def storage_candidates_from_macos_metadata(records: list[MacOSVolumeMetadata]) -> list[StorageCandidate]:
    """Convert reviewed native volume records into conservative storage candidates.

    The native layer may know more than the portable mount-root scanner, but this
    function remains advisory: it does not copy, delete, eject, or recursively
    scan media. Unsafe records are skipped before reaching the existing ranking
    layer.
    """

    _validate_metadata_records(records)

    candidates: list[StorageCandidate] = []
    for record in records:
        if _should_skip_metadata_record(record):
            continue
        candidates.append(
            StorageCandidate(
                name=record.name,
                path=record.mount_path,
                free_bytes=record.free_bytes,
                total_bytes=record.total_bytes,
                is_removable=record.is_removable or record.is_ejectable,
                is_read_only=record.is_read_only,
            )
        )
    return candidates


def recommend_import_route_from_macos_metadata(
    records: list[MacOSVolumeMetadata],
    *,
    expected_import_bytes: int | None = None,
    headroom_bytes: int = 32 * 1024**3,
) -> ImportRouteRecommendation:
    """Recommend a reviewed import route from native macOS volume metadata."""

    _validate_capacity_arguments(expected_import_bytes=expected_import_bytes, headroom_bytes=headroom_bytes)
    if not isinstance(records, list):
        raise TypeError("records must be a list of MacOSVolumeMetadata objects")
    if not records:
        return _empty_metadata_recommendation(capacity_gate_active=expected_import_bytes is not None)
    candidates = storage_candidates_from_macos_metadata(records)
    if not candidates:
        return _empty_metadata_recommendation(capacity_gate_active=expected_import_bytes is not None)
    if expected_import_bytes is None:
        return recommend_import_route(candidates)
    return recommend_import_route_with_capacity(
        candidates,
        expected_import_bytes=expected_import_bytes,
        headroom_bytes=headroom_bytes,
    )


def _validate_metadata_records(records: list[MacOSVolumeMetadata]) -> None:
    if not isinstance(records, list):
        raise TypeError("records must be a list of MacOSVolumeMetadata objects")
    if not records:
        raise ValueError("records cannot be empty")
    for record in records:
        if not isinstance(record, MacOSVolumeMetadata):
            raise TypeError("records must contain only MacOSVolumeMetadata objects")


def _validate_capacity_arguments(*, expected_import_bytes: int | None, headroom_bytes: int) -> None:
    if not isinstance(headroom_bytes, int) or isinstance(headroom_bytes, bool):
        raise TypeError("headroom_bytes must be an integer")
    if headroom_bytes < 0:
        raise ValueError("headroom_bytes cannot be negative")
    if expected_import_bytes is None:
        return
    if not isinstance(expected_import_bytes, int) or isinstance(expected_import_bytes, bool):
        raise TypeError("expected_import_bytes must be an integer")
    if expected_import_bytes <= 0:
        raise ValueError("expected_import_bytes must be greater than zero")


def _validate_bytes(field_name: str, value: int) -> None:
    if not isinstance(value, int) or isinstance(value, bool):
        raise TypeError(f"{field_name} must be an integer")
    if value < 0:
        raise ValueError(f"{field_name} cannot be negative")


def _should_skip_metadata_record(record: MacOSVolumeMetadata) -> bool:
    if record.is_system_volume or record.is_network:
        return True
    if not record.mount_path.exists() or not record.mount_path.is_dir():
        return True
    return _path_or_parent_is_symlink(record.mount_path)


def _path_or_parent_is_symlink(path: Path) -> bool:
    for item in (path, *path.parents):
        if item.is_symlink():
            return True
    return False


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
