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
    """Native macOS volume facts collected by a future Swift/Disk Arbitration layer."""

    name: str
    mount_path: Path
    free_bytes: int
    total_bytes: int
    is_removable: bool
    is_ejectable: bool
    is_internal: bool
    is_read_only: bool
    is_network: bool = False
    is_system_volume: bool = False


def storage_candidates_from_macos_metadata(volumes: list[MacOSVolumeMetadata]) -> list[StorageCandidate]:
    """Convert native macOS volume metadata into conservative storage candidates.

    This is a pure adapter for Mac app shells: it does not scan recursively, copy
    files, delete files, or decide final import authority. Unsafe or irrelevant
    volumes are skipped before the existing storage ranking layer sees them.
    """

    _validate_macos_volume_metadata(volumes)
    candidates: list[StorageCandidate] = []
    for volume in volumes:
        if _should_skip_volume(volume):
            continue
        candidates.append(
            StorageCandidate(
                name=volume.name,
                path=volume.mount_path,
                free_bytes=volume.free_bytes,
                total_bytes=volume.total_bytes,
                is_removable=volume.is_removable or (volume.is_ejectable and not volume.is_internal),
                is_read_only=volume.is_read_only,
            )
        )
    return candidates


def recommend_import_route_from_macos_metadata(
    volumes: list[MacOSVolumeMetadata],
    *,
    expected_import_bytes: int | None = None,
    headroom_bytes: int = 32 * 1024**3,
) -> ImportRouteRecommendation:
    """Recommend a reviewed import route from native macOS volume metadata."""

    _validate_capacity_arguments(expected_import_bytes=expected_import_bytes, headroom_bytes=headroom_bytes)
    candidates = storage_candidates_from_macos_metadata(volumes)
    if not candidates:
        return _empty_metadata_recommendation(capacity_gate_active=expected_import_bytes is not None)
    if expected_import_bytes is None:
        return recommend_import_route(candidates)
    return recommend_import_route_with_capacity(
        candidates,
        expected_import_bytes=expected_import_bytes,
        headroom_bytes=headroom_bytes,
    )


def _validate_macos_volume_metadata(volumes: list[MacOSVolumeMetadata]) -> None:
    if not isinstance(volumes, list):
        raise TypeError("volumes must be a list of MacOSVolumeMetadata objects")
    if not volumes:
        raise ValueError("volumes cannot be empty")
    for volume in volumes:
        if not isinstance(volume, MacOSVolumeMetadata):
            raise TypeError("volumes must contain only MacOSVolumeMetadata objects")
        _validate_volume(volume)


def _validate_volume(volume: MacOSVolumeMetadata) -> None:
    if not isinstance(volume.name, str) or not volume.name.strip():
        raise ValueError("volume name must be a non-empty string")
    if not isinstance(volume.mount_path, Path):
        raise TypeError("volume mount_path must be a pathlib.Path")
    for label in ("free_bytes", "total_bytes"):
        value = getattr(volume, label)
        if not isinstance(value, int):
            raise TypeError(f"volume {label} must be an integer")
        if value < 0:
            raise ValueError(f"volume {label} cannot be negative")
    if volume.total_bytes < volume.free_bytes:
        raise ValueError("volume total_bytes cannot be less than free_bytes")
    for label in (
        "is_removable",
        "is_ejectable",
        "is_internal",
        "is_read_only",
        "is_network",
        "is_system_volume",
    ):
        if not isinstance(getattr(volume, label), bool):
            raise TypeError(f"volume {label} must be a boolean")


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


def _should_skip_volume(volume: MacOSVolumeMetadata) -> bool:
    if volume.is_system_volume or volume.is_network:
        return True
    return (
        not volume.mount_path.exists()
        or not volume.mount_path.is_dir()
        or volume.mount_path.is_symlink()
    )


def _empty_metadata_recommendation(*, capacity_gate_active: bool) -> ImportRouteRecommendation:
    notes = [
        "review source and destination before importing",
        "source media will not be deleted",
        "copy must be verified by checksum manifest",
        "eject cards only after manifest review and backup verification",
        "no usable macOS volume metadata candidates found",
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
