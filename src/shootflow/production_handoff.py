from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from shootflow.catalog import load_ingest_manifest, production_assets_from_manifest
from shootflow.production import ProductionJob, build_production_plan

ProductionWaveStatus = Literal["ready", "blocked", "complete"]

_SAFETY_NOTES = (
    "read-only production wave handoff",
    "no analysis, grading, render, or deliverable files were written",
    "run only the declared jobs and report completed job IDs back to the caller",
    "source media must not be deleted",
)


class ProductionHandoffError(ValueError):
    """Raised when a production wave handoff cannot be planned safely."""


@dataclass(frozen=True)
class ProductionWaveHandoff:
    manifest_path: Path
    workspace: Path
    shoot_slug: str
    status: ProductionWaveStatus
    wave_index: int | None
    jobs: tuple[ProductionJob, ...]
    completed_job_ids: tuple[str, ...]
    blocked_dependency_ids: tuple[str, ...]
    safety_notes: tuple[str, ...] = _SAFETY_NOTES


def plan_next_production_wave(
    ingest_manifest_path: Path | str,
    completed_job_ids: Sequence[str] = (),
) -> ProductionWaveHandoff:
    if not isinstance(ingest_manifest_path, (Path, str)):
        raise TypeError("ingest_manifest_path must be a path-like string")
    completed_ids = _validated_completed_job_ids(completed_job_ids)

    manifest_path = Path(ingest_manifest_path)
    catalog = load_ingest_manifest(manifest_path)
    production_plan = build_production_plan(
        production_assets_from_manifest(catalog),
        shoot_slug=catalog.shoot_slug,
    )
    known_job_ids = {job.job_id for job in production_plan.jobs}
    unknown_ids = sorted(set(completed_ids) - known_job_ids)
    if unknown_ids:
        raise ProductionHandoffError(f"Unknown completed production job ID: {unknown_ids[0]}")

    completed_set = set(completed_ids)
    _validate_completed_dependencies(production_plan.jobs, completed_set)
    ordered_completed_ids = tuple(job.job_id for job in production_plan.jobs if job.job_id in completed_set)

    for wave in production_plan.execution_waves:
        remaining_jobs = tuple(job for job in wave.jobs if job.job_id not in completed_set)
        if not remaining_jobs:
            continue
        blocked_dependency_ids = tuple(
            sorted(
                {
                    dependency_id
                    for job in remaining_jobs
                    for dependency_id in job.depends_on
                    if dependency_id not in completed_set
                }
            )
        )
        return ProductionWaveHandoff(
            manifest_path=manifest_path,
            workspace=manifest_path.parent,
            shoot_slug=catalog.shoot_slug,
            status="blocked" if blocked_dependency_ids else "ready",
            wave_index=wave.wave_index,
            jobs=remaining_jobs,
            completed_job_ids=ordered_completed_ids,
            blocked_dependency_ids=blocked_dependency_ids,
        )

    return ProductionWaveHandoff(
        manifest_path=manifest_path,
        workspace=manifest_path.parent,
        shoot_slug=catalog.shoot_slug,
        status="complete",
        wave_index=None,
        jobs=(),
        completed_job_ids=ordered_completed_ids,
        blocked_dependency_ids=(),
    )


def _validated_completed_job_ids(completed_job_ids: Sequence[str]) -> tuple[str, ...]:
    if isinstance(completed_job_ids, str) or not isinstance(completed_job_ids, Sequence):
        raise TypeError("completed_job_ids must be a sequence of strings")
    validated_ids: list[str] = []
    seen_ids: set[str] = set()
    for job_id in completed_job_ids:
        if not isinstance(job_id, str) or not job_id.strip():
            raise ProductionHandoffError("completed job IDs must be non-empty strings")
        if job_id in seen_ids:
            raise ProductionHandoffError(f"Duplicate completed production job ID: {job_id}")
        seen_ids.add(job_id)
        validated_ids.append(job_id)
    return tuple(validated_ids)


def _validate_completed_dependencies(jobs: tuple[ProductionJob, ...], completed_set: set[str]) -> None:
    for job in jobs:
        if job.job_id not in completed_set:
            continue
        for dependency_id in job.depends_on:
            if dependency_id not in completed_set:
                raise ProductionHandoffError(
                    f"Completed production job {job.job_id} is missing completed dependency {dependency_id}"
                )
