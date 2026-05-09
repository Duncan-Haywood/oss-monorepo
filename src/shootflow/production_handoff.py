from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from shootflow.catalog import load_ingest_manifest, production_assets_from_manifest
from shootflow.production import ProductionJob, ProductionPlan, build_production_plan

ProductionHandoffStatus = Literal["ready", "blocked", "complete"]


class ProductionHandoffError(ValueError):
    """Raised when a production wave handoff cannot be built safely."""


@dataclass(frozen=True)
class ProductionWaveHandoff:
    manifest_path: Path
    workspace: Path
    shoot_slug: str
    status: ProductionHandoffStatus
    wave_index: int | None
    completed_job_ids: tuple[str, ...]
    blocked_dependency_ids: tuple[str, ...]
    jobs: tuple[ProductionJob, ...]
    production_plan: ProductionPlan
    notes: tuple[str, ...]


def plan_next_production_wave(
    ingest_manifest_path: Path | str,
    *,
    completed_job_ids: Sequence[str] = (),
) -> ProductionWaveHandoff:
    if not isinstance(ingest_manifest_path, (Path, str)):
        raise TypeError("ingest_manifest_path must be a path-like string")
    if isinstance(completed_job_ids, (str, bytes)):
        raise TypeError("completed_job_ids must be a sequence of strings")
    for completed_job_id in completed_job_ids:
        if not isinstance(completed_job_id, str) or not completed_job_id:
            raise ProductionHandoffError("completed production job IDs must be non-empty strings")

    manifest_path = Path(ingest_manifest_path)
    catalog = load_ingest_manifest(manifest_path)
    assets = production_assets_from_manifest(catalog)
    production_plan = build_production_plan(assets, shoot_slug=catalog.shoot_slug)
    completed_ids = _canonical_completed_job_ids(production_plan, completed_job_ids)
    completed_set = set(completed_ids)
    _validate_completed_dependencies(production_plan, completed_set)

    for wave in production_plan.execution_waves:
        pending_wave_jobs = tuple(job for job in wave.jobs if job.job_id not in completed_set)
        if not pending_wave_jobs:
            continue
        ready_jobs = tuple(
            job for job in pending_wave_jobs if all(dependency_id in completed_set for dependency_id in job.depends_on)
        )
        if ready_jobs:
            return ProductionWaveHandoff(
                manifest_path=manifest_path,
                workspace=manifest_path.parent,
                shoot_slug=catalog.shoot_slug,
                status="ready",
                wave_index=wave.wave_index,
                completed_job_ids=completed_ids,
                blocked_dependency_ids=(),
                jobs=ready_jobs,
                production_plan=production_plan,
                notes=_handoff_notes(),
            )
        return ProductionWaveHandoff(
            manifest_path=manifest_path,
            workspace=manifest_path.parent,
            shoot_slug=catalog.shoot_slug,
            status="blocked",
            wave_index=wave.wave_index,
            completed_job_ids=completed_ids,
            blocked_dependency_ids=_blocked_dependency_ids(pending_wave_jobs, completed_set),
            jobs=(),
            production_plan=production_plan,
            notes=_handoff_notes(),
        )

    return ProductionWaveHandoff(
        manifest_path=manifest_path,
        workspace=manifest_path.parent,
        shoot_slug=catalog.shoot_slug,
        status="complete",
        wave_index=None,
        completed_job_ids=completed_ids,
        blocked_dependency_ids=(),
        jobs=(),
        production_plan=production_plan,
        notes=_handoff_notes(),
    )


def _canonical_completed_job_ids(
    production_plan: ProductionPlan,
    completed_job_ids: Sequence[str],
) -> tuple[str, ...]:
    seen: set[str] = set()
    completed_set: set[str] = set()
    known_job_ids = {job.job_id for job in production_plan.jobs}
    for completed_job_id in completed_job_ids:
        if completed_job_id in seen:
            raise ProductionHandoffError(f"Duplicate completed production job: {completed_job_id}")
        if completed_job_id not in known_job_ids:
            raise ProductionHandoffError(f"Unknown production job: {completed_job_id}")
        seen.add(completed_job_id)
        completed_set.add(completed_job_id)
    return tuple(job.job_id for job in production_plan.jobs if job.job_id in completed_set)


def _validate_completed_dependencies(production_plan: ProductionPlan, completed_set: set[str]) -> None:
    for job in production_plan.jobs:
        if job.job_id not in completed_set:
            continue
        missing_dependencies = tuple(
            dependency_id for dependency_id in job.depends_on if dependency_id not in completed_set
        )
        if missing_dependencies:
            raise ProductionHandoffError(
                f"Completed production job {job.job_id} depends on incomplete job(s): "
                + ", ".join(missing_dependencies)
            )


def _blocked_dependency_ids(
    jobs: tuple[ProductionJob, ...],
    completed_set: set[str],
) -> tuple[str, ...]:
    blocked_ids = {
        dependency_id
        for job in jobs
        for dependency_id in job.depends_on
        if dependency_id not in completed_set
    }
    return tuple(sorted(blocked_ids))


def _handoff_notes() -> tuple[str, ...]:
    return (
        "read-only production wave handoff",
        "no analysis, grading, render, or deliverable files were written",
        "completed job IDs are caller-reported until a persisted production status manifest exists",
        "ingest manifest remains the safety boundary before AI/editing work",
    )
