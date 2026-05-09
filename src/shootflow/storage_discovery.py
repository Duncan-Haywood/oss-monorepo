from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path

from shootflow.storage import (
    ImportRouteRecommendation,
    StorageCandidate,
    recommend_import_route,
    recommend_import_route_with_capacity,
)


@dataclass(frozen=True)
class VolumeDiscoveryHint:
    display_name: str | None = None
    is_removable: bool | None = None
    is_read_only: bool | None = None


def discover_storage_candidates(
    volume_roots: list[Path],
    *,
    volume_hints: dict[Path, VolumeDiscoveryHint] | None = None,
) -> list[StorageCandidate]:
    """Discover mounted-volume-like directories for conservative import routing.

    Native app layers can pass macOS roots such as /Volumes, test fixtures, or
    other reviewed mount directories. Discovery only inspects immediate
    children, skips symlinks and files, and returns StorageCandidate records for
    the existing ranking/recommendation layer.
    """

    _validate_volume_roots(volume_roots)
    _validate_volume_hints(volume_hints)

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
            free_bytes, total_bytes = stats
            hint = _volume_hint_for_path(child, volume_hints)
            filesystem_read_only = not os.access(child, os.W_OK)
            candidates.append(
                StorageCandidate(
                    name=hint.display_name if hint is not None and hint.display_name is not None else child.name,
                    path=child,
                    free_bytes=free_bytes,
                    total_bytes=total_bytes,
                    is_removable=hint.is_removable if hint is not None and hint.is_removable is not None else True,
                    is_read_only=filesystem_read_only or (hint is not None and hint.is_read_only is True),
                )
            )
    return candidates


def discover_import_route(
    volume_roots: list[Path],
    *,
    expected_import_bytes: int | None = None,
    headroom_bytes: int = 32 * 1024**3,
    volume_hints: dict[Path, VolumeDiscoveryHint] | None = None,
) -> ImportRouteRecommendation:
    """Discover storage candidates and recommend a reviewed import route."""

    _validate_capacity_arguments(expected_import_bytes=expected_import_bytes, headroom_bytes=headroom_bytes)
    candidates = discover_storage_candidates(volume_roots, volume_hints=volume_hints)
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


def _validate_volume_hints(volume_hints: dict[Path, VolumeDiscoveryHint] | None) -> None:
    if volume_hints is None:
        return
    if not isinstance(volume_hints, dict):
        raise TypeError("volume_hints must be a dict keyed by Path")
    for path, hint in volume_hints.items():
        if not isinstance(path, Path):
            raise TypeError("volume_hints keys must be Path objects")
        if not isinstance(hint, VolumeDiscoveryHint):
            raise TypeError("volume_hints values must be VolumeDiscoveryHint objects")
        if hint.display_name is not None and (
            not isinstance(hint.display_name, str) or not hint.display_name.strip()
        ):
            raise ValueError("volume hint display_name must be a non-empty string")
        if hint.is_removable is not None and not isinstance(hint.is_removable, bool):
            raise TypeError("volume hint is_removable must be a boolean")
        if hint.is_read_only is not None and not isinstance(hint.is_read_only, bool):
            raise TypeError("volume hint is_read_only must be a boolean")


def _volume_hint_for_path(
    path: Path,
    volume_hints: dict[Path, VolumeDiscoveryHint] | None,
) -> VolumeDiscoveryHint | None:
    if volume_hints is None:
        return None
    hint = volume_hints.get(path)
    if hint is not None:
        return hint
    try:
        resolved_path = path.resolve()
    except OSError:
        return None
    return volume_hints.get(resolved_path)


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
