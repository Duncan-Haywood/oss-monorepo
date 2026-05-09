from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from shootflow.storage import (
    ImportRouteRecommendation,
    StorageCandidate,
    recommend_import_route,
    recommend_import_route_with_capacity,
)


@dataclass(frozen=True)
class DiscoveredVolumeMetadata:
    name: str | None = None
    free_bytes: int | None = None
    total_bytes: int | None = None
    is_removable: bool | None = None
    is_read_only: bool | None = None


def discover_storage_candidates(
    volume_roots: list[Path],
    *,
    metadata_by_path: dict[Path, DiscoveredVolumeMetadata] | None = None,
) -> list[StorageCandidate]:
    """Discover mounted-volume-like directories for conservative import routing.

    Native app layers can pass macOS roots such as /Volumes, test fixtures, or
    other reviewed mount directories. Discovery only inspects immediate
    children, skips symlinks and files, and returns StorageCandidate records for
    the existing ranking/recommendation layer. Optional native metadata lets a
    Mac shell provide Disk Arbitration facts without changing the routing logic.
    """

    _validate_volume_roots(volume_roots)
    metadata = _validated_metadata_by_path(metadata_by_path)

    candidates: list[StorageCandidate] = []
    for root in volume_roots:
        if not root.exists() or not root.is_dir() or root.is_symlink():
            continue
        for child in _iter_volume_children(root):
            if not child.is_dir() or child.is_symlink():
                continue
            stats = _read_filesystem_stats(child)
            if stats is None:
                continue
            child_metadata = metadata.get(_metadata_key(child))
            free_bytes, total_bytes = _candidate_capacity(stats, child_metadata)
            candidates.append(
                StorageCandidate(
                    name=_candidate_name(child, child_metadata),
                    path=child,
                    free_bytes=free_bytes,
                    total_bytes=total_bytes,
                    is_removable=_candidate_is_removable(child_metadata),
                    is_read_only=_candidate_is_read_only(child, child_metadata),
                )
            )
    return sorted(candidates, key=lambda candidate: candidate.name.casefold())


def discover_import_route(
    volume_roots: list[Path],
    *,
    expected_import_bytes: int | None = None,
    headroom_bytes: int = 32 * 1024**3,
    metadata_by_path: dict[Path, DiscoveredVolumeMetadata] | None = None,
) -> ImportRouteRecommendation:
    """Discover storage candidates and recommend a reviewed import route."""

    _validate_capacity_arguments(expected_import_bytes=expected_import_bytes, headroom_bytes=headroom_bytes)
    candidates = discover_storage_candidates(volume_roots, metadata_by_path=metadata_by_path)
    if not candidates:
        return _empty_discovery_recommendation(capacity_gate_active=expected_import_bytes is not None)
    if expected_import_bytes is None:
        return recommend_import_route(candidates)
    return recommend_import_route_with_capacity(
        candidates,
        expected_import_bytes=expected_import_bytes,
        headroom_bytes=headroom_bytes,
    )


def _validate_volume_roots(volume_roots: list[Path]) -> None:
    if not isinstance(volume_roots, list):
        raise TypeError("volume_roots must be a list of Path objects")
    if not volume_roots:
        raise ValueError("volume_roots cannot be empty")
    for root in volume_roots:
        if not isinstance(root, Path):
            raise TypeError("volume_roots must contain only Path objects")


def _validated_metadata_by_path(
    metadata_by_path: dict[Path, DiscoveredVolumeMetadata] | None,
) -> dict[Path, DiscoveredVolumeMetadata]:
    if metadata_by_path is None:
        return {}
    if not isinstance(metadata_by_path, dict):
        raise TypeError("metadata_by_path must be a dict of Path to DiscoveredVolumeMetadata")
    normalized: dict[Path, DiscoveredVolumeMetadata] = {}
    for path, metadata in metadata_by_path.items():
        if not isinstance(path, Path):
            raise TypeError("metadata_by_path keys must be Path objects")
        _validate_discovered_volume_metadata(metadata)
        normalized[_metadata_key(path)] = metadata
    return normalized


def _validate_discovered_volume_metadata(metadata: DiscoveredVolumeMetadata) -> None:
    if not isinstance(metadata, DiscoveredVolumeMetadata):
        raise TypeError("metadata_by_path values must be DiscoveredVolumeMetadata objects")
    if metadata.name is not None and (not isinstance(metadata.name, str) or not metadata.name.strip()):
        raise ValueError("metadata name must be a non-empty string when provided")
    for key, value in (("free_bytes", metadata.free_bytes), ("total_bytes", metadata.total_bytes)):
        if value is None:
            continue
        if type(value) is not int:
            raise TypeError(f"{key} must be an integer")
        if value < 0:
            raise ValueError(f"{key} cannot be negative")
    for key, value in (("is_removable", metadata.is_removable), ("is_read_only", metadata.is_read_only)):
        if value is not None and not isinstance(value, bool):
            raise TypeError(f"{key} must be a boolean")
    if (
        metadata.free_bytes is not None
        and metadata.total_bytes is not None
        and metadata.free_bytes > metadata.total_bytes
    ):
        raise ValueError("free_bytes cannot exceed total_bytes")


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


def _empty_discovery_recommendation(*, capacity_gate_active: bool) -> ImportRouteRecommendation:
    notes = [
        "review source and destination before importing",
        "source media will not be deleted",
        "copy must be verified by checksum manifest",
        "eject cards only after manifest review and backup verification",
        "no discovered storage candidates found",
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


def _iter_volume_children(root: Path) -> list[Path]:
    try:
        return sorted(root.iterdir(), key=lambda path: path.name.casefold())
    except OSError:
        return []


def _read_filesystem_stats(path: Path) -> tuple[int, int] | None:
    try:
        stats = os.statvfs(path)
    except OSError:
        return None
    block_size = stats.f_frsize
    return stats.f_bavail * block_size, stats.f_blocks * block_size


def _metadata_key(path: Path) -> Path:
    return path.resolve(strict=False)


def _candidate_name(child: Path, metadata: DiscoveredVolumeMetadata | None) -> str:
    if metadata is not None and metadata.name is not None:
        return metadata.name
    return child.name


def _candidate_capacity(
    stats: tuple[int, int],
    metadata: DiscoveredVolumeMetadata | None,
) -> tuple[int, int]:
    fallback_free_bytes, fallback_total_bytes = stats
    if metadata is None:
        return fallback_free_bytes, fallback_total_bytes
    free_bytes = metadata.free_bytes if metadata.free_bytes is not None else fallback_free_bytes
    total_bytes = metadata.total_bytes if metadata.total_bytes is not None else fallback_total_bytes
    if free_bytes > total_bytes:
        raise ValueError("candidate free_bytes cannot exceed total_bytes")
    return free_bytes, total_bytes


def _candidate_is_removable(metadata: DiscoveredVolumeMetadata | None) -> bool:
    if metadata is not None and metadata.is_removable is not None:
        return metadata.is_removable
    return True


def _candidate_is_read_only(child: Path, metadata: DiscoveredVolumeMetadata | None) -> bool:
    if metadata is not None and metadata.is_read_only is not None:
        return metadata.is_read_only
    return not os.access(child, os.W_OK)
