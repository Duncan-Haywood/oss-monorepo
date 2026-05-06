from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path


class DriveRole(StrEnum):
    INGEST_SOURCE = "ingest_source"
    WORKING_DESTINATION = "working_destination"
    ARCHIVE_DESTINATION = "archive_destination"
    REVIEW_ONLY = "review_only"


@dataclass(frozen=True)
class StorageCandidate:
    mount_path: Path
    name: str
    free_bytes: int
    is_removable: bool
    is_writable: bool
    media_markers: frozenset[str]


@dataclass(frozen=True)
class DriveAssessment:
    candidate: StorageCandidate
    recommended_role: DriveRole
    score: int
    reasons: tuple[str, ...]
    warnings: tuple[str, ...] = ()


def rank_storage_candidates(
    candidates: list[StorageCandidate],
    desired_role: DriveRole = DriveRole.INGEST_SOURCE,
) -> list[DriveAssessment]:
    assessments = [_assess_candidate(candidate, desired_role) for candidate in candidates]
    return sorted(
        assessments,
        key=lambda assessment: (
            assessment.score,
            assessment.candidate.free_bytes,
            assessment.candidate.name.lower(),
        ),
        reverse=True,
    )


def _assess_candidate(
    candidate: StorageCandidate,
    desired_role: DriveRole,
) -> DriveAssessment:
    if not candidate.is_writable:
        return DriveAssessment(
            candidate=candidate,
            recommended_role=DriveRole.REVIEW_ONLY,
            score=0,
            reasons=("read-only media can be inspected but not used as a safe copy target",),
            warnings=("read-only",),
        )

    source_score, source_reasons = _source_score(candidate)
    destination_score, destination_reasons = _destination_score(candidate)

    if desired_role in {DriveRole.WORKING_DESTINATION, DriveRole.ARCHIVE_DESTINATION}:
        return DriveAssessment(
            candidate=candidate,
            recommended_role=desired_role
            if destination_score >= source_score
            else DriveRole.INGEST_SOURCE,
            score=destination_score,
            reasons=tuple(destination_reasons),
        )

    if desired_role == DriveRole.INGEST_SOURCE:
        if source_score == 0:
            return DriveAssessment(
                candidate=candidate,
                recommended_role=DriveRole.REVIEW_ONLY,
                score=0,
                reasons=("no ingest-source evidence",),
                warnings=("low-confidence ingest source",),
            )
        return DriveAssessment(
            candidate=candidate,
            recommended_role=DriveRole.INGEST_SOURCE,
            score=source_score,
            reasons=tuple(source_reasons),
        )

    return DriveAssessment(
        candidate=candidate,
        recommended_role=DriveRole.REVIEW_ONLY,
        score=0,
        reasons=("manual review requested",),
    )


def _source_score(candidate: StorageCandidate) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []

    if candidate.media_markers:
        score += 100
        reasons.append("camera media markers")
    if candidate.is_removable:
        score += 20
        reasons.append("removable drive")
    if candidate.free_bytes < 256_000_000_000:
        score += 10
        reasons.append("card-sized free space")

    return score, reasons


def _destination_score(candidate: StorageCandidate) -> tuple[int, list[str]]:
    score = 10
    reasons = ["writable"]

    if candidate.free_bytes >= 1_000_000_000_000:
        score += 100
        reasons.append("large free space")
    if not candidate.media_markers:
        score += 30
        reasons.append("no camera media markers")

    return score, reasons
