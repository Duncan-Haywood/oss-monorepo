from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class StorageCandidate:
    name: str
    path: Path
    free_bytes: int
    total_bytes: int
    is_removable: bool
    is_read_only: bool


@dataclass(frozen=True)
class RankedStorageCandidate:
    candidate: StorageCandidate
    role: str
    safety: str
    confidence: int
    reasons: tuple[str, ...]


def rank_storage_candidates(candidates: list[StorageCandidate]) -> list[RankedStorageCandidate]:
    ranked = [_rank_candidate(candidate) for candidate in candidates]
    return sorted(ranked, key=lambda item: item.confidence, reverse=True)


def _rank_candidate(candidate: StorageCandidate) -> RankedStorageCandidate:
    reasons: list[str] = []
    confidence = 0

    has_dcim = (candidate.path / "DCIM").is_dir()
    has_private = (candidate.path / "PRIVATE").exists()
    has_camera_name = any(token in candidate.name.upper() for token in ("EOS", "NIKON", "FUJI", "SONY", "LEICA", "LUMIX"))

    if has_dcim:
        confidence += 55
        reasons.append("DCIM")
    if has_private:
        confidence += 20
        reasons.append("PRIVATE")
    if candidate.is_removable:
        confidence += 20
        reasons.append("removable")
    if has_camera_name:
        confidence += 15
        reasons.append("camera-like name")

    if confidence >= 60:
        return RankedStorageCandidate(
            candidate=candidate,
            role="source",
            safety="review",
            confidence=min(confidence, 100),
            reasons=tuple(reasons),
        )

    writable_capacity = candidate.free_bytes > 64 * 1024**3 and not candidate.is_read_only
    if writable_capacity:
        reasons.append("writable")
        if candidate.free_bytes > 512 * 1024**3:
            reasons.append("large free space")
        return RankedStorageCandidate(
            candidate=candidate,
            role="destination",
            safety="automatic",
            confidence=75 if candidate.is_removable else 65,
            reasons=tuple(reasons),
        )

    if candidate.is_read_only:
        reasons.append("read-only")

    return RankedStorageCandidate(
        candidate=candidate,
        role="review",
        safety="review",
        confidence=min(confidence, 49),
        reasons=tuple(reasons),
    )
