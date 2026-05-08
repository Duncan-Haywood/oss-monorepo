from __future__ import annotations

import os
from pathlib import Path

from shootflow.storage import (
    ImportRouteRecommendation,
    StorageCandidate,
    recommend_import_route,
    recommend_import_route_with_capacity,
)


def discover_storage_candidates(volume_roots: list[Path]) -> list[StorageCandidate]:
    """Discover mounted-volume-like directories for conservative import routing.

    Native app layers can pass macOS roots such as /Volumes, test fixtures, or
    other reviewed mount directories. Discovery only inspects immediate
    children, skips symlinks and files, and returns StorageCandidate records for
    the existing ranking/recommendation layer.
    """

    _validate_volume_roots(volume_roots)

    candidates: list[StorageCandidate] = []
    for root in volume_roots:
        if not root.exists() or not root.is_dir() or root.is_symlink():
            continue
        for child in sorted(root.iterdir(), key=lambda path: path.name.casefold()):
            if not child.is_dir() or child.is_symlink():
                continue
            stats = _read_filesystem_stats(child)
            if stats is None:
                continue
            free_bytes, total_bytes = stats
            candidates.append(
                StorageCandidate(
                    name=child.name,
                    path=child,
                    free_bytes=free_bytes,
                    total_bytes=total_bytes,
                    is_removable=True,
                    is_read_only=not os.access(child, os.W_OK),
                )
            )
    return candidates


def discover_import_route(
    volume_roots: list[Path],
    *,
    expected_import_bytes: int | None = None,
    headroom_bytes: int = 32 * 1024**3,
) -> ImportRouteRecommendation:
    """Discover storage candidates and recommend a reviewed import route."""

    _validate_capacity_arguments(expected_import_bytes=expected_import_bytes, headroom_bytes=headroom_bytes)
    candidates = discover_storage_candidates(volume_roots)
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


def _read_filesystem_stats(path: Path) -> tuple[int, int] | None:
    try:
        stats = os.statvfs(path)
    except OSError:
        return None
    block_size = stats.f_frsize
    return stats.f_bavail * block_size, stats.f_blocks * block_size
