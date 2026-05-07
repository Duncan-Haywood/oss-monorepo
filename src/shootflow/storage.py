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


@dataclass(frozen=True)
class ImportRouteRecommendation:
    source: RankedStorageCandidate | None
    destination: RankedStorageCandidate | None
    status: str
    ready: bool
    review_required: bool
    safety_notes: tuple[str, ...]


def rank_storage_candidates(candidates: list[StorageCandidate]) -> list[RankedStorageCandidate]:
    ranked = [_rank_candidate(candidate) for candidate in candidates]
    return sorted(ranked, key=lambda item: item.confidence, reverse=True)


def recommend_import_route(candidates: list[StorageCandidate]) -> ImportRouteRecommendation:
    """Choose a conservative source/destination pair for a reviewed import flow.

    The recommendation is for UI/agent guidance only. It never authorizes source
    deletion or a blind import; callers still pass the reviewed paths through the
    ingest planner and checksum-copy manifest boundary.
    """

    if not isinstance(candidates, list):
        raise TypeError("candidates must be a list of StorageCandidate objects")
    if not candidates:
        raise ValueError("candidates cannot be empty")
    for candidate in candidates:
        if not isinstance(candidate, StorageCandidate):
            raise TypeError("candidates must contain only StorageCandidate objects")

    ranked = rank_storage_candidates(candidates)
    source = _first_role(ranked, "source")
    if source is not None and not source.candidate.path.is_dir():
        source = None
    destination, destination_rejection_notes = _first_destination_not_source(ranked, source)
    ready = source is not None and destination is not None
    notes = _import_route_safety_notes(
        source=source,
        destination=destination,
        destination_rejection_notes=destination_rejection_notes,
    )

    return ImportRouteRecommendation(
        source=source,
        destination=destination,
        status="ready_for_review" if ready else "blocked",
        ready=ready,
        review_required=True,
        safety_notes=notes,
    )


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


def _first_role(
    ranked: list[RankedStorageCandidate],
    role: str,
) -> RankedStorageCandidate | None:
    for candidate in ranked:
        if candidate.role == role:
            return candidate
    return None


def _first_destination_not_source(
    ranked: list[RankedStorageCandidate],
    source: RankedStorageCandidate | None,
) -> tuple[RankedStorageCandidate | None, tuple[str, ...]]:
    rejection_notes: list[str] = []
    source_path = source.candidate.path.resolve() if source is not None else None
    for candidate in ranked:
        if candidate.role != "destination":
            continue
        if not candidate.candidate.path.is_dir():
            rejection_notes.append("no mounted destination directory candidate with enough writable space")
            continue
        destination_path = candidate.candidate.path.resolve()
        if source_path is not None and destination_path == source_path:
            rejection_notes.append("destination candidate matches the selected source")
            continue
        if source_path is not None and _path_is_relative_to(destination_path, source_path):
            rejection_notes.append("destination candidate is inside the selected source")
            continue
        return candidate, ()
    return None, tuple(dict.fromkeys(rejection_notes))


def _import_route_safety_notes(
    *,
    source: RankedStorageCandidate | None,
    destination: RankedStorageCandidate | None,
    destination_rejection_notes: tuple[str, ...],
) -> tuple[str, ...]:
    notes = [
        "review source and destination before importing",
        "source media will not be deleted",
        "copy must be verified by checksum manifest",
        "eject cards only after manifest review and backup verification",
    ]
    if source is None:
        notes.append("no likely camera-card source candidate found")
    if destination is None:
        if destination_rejection_notes:
            notes.extend(destination_rejection_notes)
        else:
            notes.append("no automatic destination candidate with enough writable space")
    return tuple(notes)


def _path_is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True
