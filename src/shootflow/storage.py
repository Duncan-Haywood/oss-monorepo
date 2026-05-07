from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


Bytes = int


@dataclass(frozen=True)
class StorageVolume:
    path: Path
    name: str
    total_bytes: Bytes
    free_bytes: Bytes
    removable: bool
    read_only: bool

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValueError("volume name cannot be empty")
        if self.total_bytes <= 0:
            raise ValueError("total_bytes must be positive")
        if self.free_bytes < 0:
            raise ValueError("free_bytes cannot be negative")
        if self.free_bytes > self.total_bytes:
            raise ValueError("free_bytes cannot exceed total_bytes")


@dataclass(frozen=True)
class StorageCandidate:
    volume: StorageVolume
    source_score: int
    destination_score: int
    source_action: str
    destination_action: str
    reasons: tuple[str, ...]


def rank_storage_candidates(volumes: list[StorageVolume]) -> list[StorageCandidate]:
    candidates = [_rank_volume(volume) for volume in volumes]
    return sorted(
        candidates,
        key=lambda candidate: (
            candidate.destination_action == "auto",
            candidate.destination_score,
            candidate.source_score,
        ),
        reverse=True,
    )


def _rank_volume(volume: StorageVolume) -> StorageCandidate:
    reasons: list[str] = []
    source_score = 0
    destination_score = 0
    source_action = "review"
    destination_action = "review"

    if _looks_like_camera_card(volume):
        source_score += 90
        destination_score -= 100
        source_action = "review"
        destination_action = "never"
        reasons.append("camera card")

    if volume.read_only:
        source_score += 20
        destination_score -= 100
        source_action = "review"
        destination_action = "never"
        reasons.append("read-only")

    if _looks_like_large_writable_storage(volume):
        destination_score += 95
        source_score += 10
        destination_action = "auto"
        reasons.append("large writable volume")

    if not reasons:
        reasons.append("unknown volume")

    if destination_action != "never" and volume.free_bytes < 20 * 1024**3:
        destination_action = "review"
        destination_score -= 20
        reasons.append("low free space")

    return StorageCandidate(
        volume=volume,
        source_score=source_score,
        destination_score=destination_score,
        source_action=source_action,
        destination_action=destination_action,
        reasons=tuple(reasons),
    )


def _looks_like_camera_card(volume: StorageVolume) -> bool:
    name = volume.name.upper()
    camera_names = ("EOS", "NIKON", "SONY", "LUMIX", "FUJI", "CANON", "BLACKMAGIC")
    has_camera_name = any(marker in name for marker in camera_names)
    has_camera_folder = (volume.path / "DCIM").exists() or (volume.path / "PRIVATE").exists()
    small_enough_for_card = volume.total_bytes <= 512 * 1024**3
    return volume.removable and small_enough_for_card and (has_camera_name or has_camera_folder)


def _looks_like_large_writable_storage(volume: StorageVolume) -> bool:
    return (
        not volume.read_only
        and volume.total_bytes >= 1 * 1024**4
        and volume.free_bytes >= 250 * 1024**3
        and not _looks_like_camera_card(volume)
    )
