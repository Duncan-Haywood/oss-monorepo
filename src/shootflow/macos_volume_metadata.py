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
    """Native macOS volume metadata normalized before safe import routing."""

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


def storage_candidates_from_macos_metadata(records: list[MacOSVolumeMetadata]) -> list[StorageCandidate]:
    """Convert reviewed native macOS volume records into storage candidates.

    This adapter is intentionally advisory. It does not scan recursively, copy
    media, delete source files, format cards, or treat native disk metadata as
    user approval. Callers still pass the resulting candidates through the
    existing review-required route and checksum-ingest boundaries.
    """

    _validate_metadata_records(records)

    candidates: list[StorageCandidate] = []
    for record in records:
        if _should_skip_record(record):
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
        _validate_metadata_record(record)


def _validate_metadata_record(record: MacOSVolumeMetadata) -> None:
    if not isinstance(record.name, str):
        raise TypeError("record name must be a string")
    if not record.name:
        raise ValueError("record name cannot be empty")
    if not isinstance(record.mount_path, Path):
        raise TypeError("record mount_path must be a Path")
    for field_name in ("free_bytes", "total_bytes"):
        value = getattr(record, field_name)
        if not isinstance(value, int):
            raise TypeError(f"record {field_name} must be an integer")
        if value < 0:
            raise ValueError(f"record {field_name} cannot be negative")
    for field_name in (
        "is_removable",
        "is_ejectable",
        "is_internal",
        "is_read_only",
        "is_network",
        "is_system_volume",
    ):
        if not isinstance(getattr(record, field_name), bool):
            raise TypeError(f"record {field_name} must be a boolean")


def _validate_capacity_arguments(*, expected_import_bytes: int | None, headroom_bytes: int) -> None:
    if expected_import_bytes is not None:
        if not isinstance(expected_import_bytes, int):
            raise TypeError("expected_import_bytes must be an integer")
        if expected_import_bytes <= 0:
            raise ValueError("expected_import_bytes must be greater than zero")
        if not isinstance(headroom_bytes, int):
            raise TypeError("headroom_bytes must be an integer")
        if headroom_bytes < 0:
            raise ValueError("headroom_bytes cannot be negative")


def _should_skip_record(record: MacOSVolumeMetadata) -> bool:
    if record.is_system_volume or record.is_network:
        return True
    if not record.mount_path.exists() or not record.mount_path.is_dir():
        return True
    return record.mount_path.is_symlink()


def _empty_metadata_recommendation(*, capacity_gate_active: bool) -> ImportRouteRecommendation:
    notes = [
        "review source and destination before importing",
        "source media will not be deleted",
        "copy must be verified by checksum manifest",
        "eject cards only after manifest review and backup verification",
        "no usable native macOS volume metadata records found",
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
