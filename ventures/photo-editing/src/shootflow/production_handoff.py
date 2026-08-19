from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from shootflow.catalog import load_ingest_manifest, production_assets_from_manifest
from shootflow.production import ProductionJob, ProductionPlan, build_production_plan
from shootflow.production_status import load_production_status_manifest

ProductionHandoffStatus = Literal["ready", "blocked", "complete"]
ProductionHandoffStatusSource = Literal["caller_reported", "production_status"]


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
    status_source: ProductionHandoffStatusSource = "caller_reported"
    active_job_ids: tuple[str, ...] = ()
    review_required_job_ids: tuple[str, ...] = ()


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
    production_plan = _production_plan_from_ingest_manifest(manifest_path)
    completed_ids = _canonical_completed_job_ids(production_plan, completed_job_ids)
    return _plan_next_production_wave_from_plan(
        manifest_path,
        production_plan=production_plan,
        completed_job_ids=completed_ids,
        job_states_by_id=None,
        status_source="caller_reported",
    )


def plan_next_production_wave_from_status(
    ingest_manifest_path: Path | str,
) -> ProductionWaveHandoff:
    if not isinstance(ingest_manifest_path, (Path, str)):
        raise TypeError("ingest_manifest_path must be a path-like string")

    manifest_path = Path(ingest_manifest_path)
    production_plan = _production_plan_from_ingest_manifest(manifest_path)
    production_status = load_production_status_manifest(
        manifest_path.parent,
        trusted_plan=production_plan,
    )
    job_states_by_id = {
        status.job_id: status.state
        for status in production_status.job_statuses
    }
    completed_ids = tuple(
        job.job_id
        for job in production_plan.jobs
        if job_states_by_id[job.job_id] == "succeeded"
    )
    return _plan_next_production_wave_from_plan(
        manifest_path,
        production_plan=production_plan,
        completed_job_ids=completed_ids,
        job_states_by_id=job_states_by_id,
        status_source="production_status",
    )


def _production_plan_from_ingest_manifest(manifest_path: Path) -> ProductionPlan:
    catalog = load_ingest_manifest(manifest_path)
    assets = production_assets_from_manifest(catalog)
    return build_production_plan(assets, shoot_slug=catalog.shoot_slug)


def _plan_next_production_wave_from_plan(
    manifest_path: Path,
    *,
    production_plan: ProductionPlan,
    completed_job_ids: tuple[str, ...],
    job_states_by_id: Mapping[str, str] | None,
    status_source: ProductionHandoffStatusSource,
) -> ProductionWaveHandoff:
    completed_set = set(completed_job_ids)
    _validate_completed_dependencies(production_plan, completed_set)
    active_job_ids = _job_ids_by_state(production_plan.jobs, job_states_by_id, "running")
    review_required_job_ids = _review_required_job_ids(production_plan.jobs, job_states_by_id)

    for wave in production_plan.execution_waves:
        pending_wave_jobs = tuple(
            job
            for job in wave.jobs
            if _job_is_incomplete(job, completed_set=completed_set, job_states_by_id=job_states_by_id)
        )
        if not pending_wave_jobs:
            continue
        ready_jobs = tuple(
            job
            for job in pending_wave_jobs
            if _job_is_schedulable(job, job_states_by_id=job_states_by_id)
            and all(dependency_id in completed_set for dependency_id in job.depends_on)
        )
        if ready_jobs:
            return ProductionWaveHandoff(
                manifest_path=manifest_path,
                workspace=manifest_path.parent,
                shoot_slug=production_plan.shoot_slug,
                status="ready",
                wave_index=wave.wave_index,
                completed_job_ids=completed_job_ids,
                blocked_dependency_ids=(),
                jobs=ready_jobs,
                production_plan=production_plan,
                notes=_handoff_notes(status_source),
                status_source=status_source,
                active_job_ids=active_job_ids,
                review_required_job_ids=review_required_job_ids,
            )
        return ProductionWaveHandoff(
            manifest_path=manifest_path,
            workspace=manifest_path.parent,
            shoot_slug=production_plan.shoot_slug,
            status="blocked",
            wave_index=wave.wave_index,
            completed_job_ids=completed_job_ids,
            blocked_dependency_ids=_blocked_dependency_ids(pending_wave_jobs, completed_set),
            jobs=(),
            production_plan=production_plan,
            notes=_handoff_notes(status_source),
            status_source=status_source,
            active_job_ids=active_job_ids,
            review_required_job_ids=review_required_job_ids,
        )

    return ProductionWaveHandoff(
        manifest_path=manifest_path,
        workspace=manifest_path.parent,
        shoot_slug=production_plan.shoot_slug,
        status="complete",
        wave_index=None,
        completed_job_ids=completed_job_ids,
        blocked_dependency_ids=(),
        jobs=(),
        production_plan=production_plan,
        notes=_handoff_notes(status_source),
        status_source=status_source,
    )


def _job_is_incomplete(
    job: ProductionJob,
    *,
    completed_set: set[str],
    job_states_by_id: Mapping[str, str] | None,
) -> bool:
    if job_states_by_id is None:
        return job.job_id not in completed_set
    return _job_state(job, job_states_by_id) != "succeeded"


def _job_is_schedulable(
    job: ProductionJob,
    *,
    job_states_by_id: Mapping[str, str] | None,
) -> bool:
    if job_states_by_id is None:
        return True
    return _job_state(job, job_states_by_id) == "pending"


def _job_state(job: ProductionJob, job_states_by_id: Mapping[str, str] | None) -> str:
    if job_states_by_id is None:
        return "pending"
    return job_states_by_id[job.job_id]


def _job_ids_by_state(
    jobs: tuple[ProductionJob, ...],
    job_states_by_id: Mapping[str, str] | None,
    state: str,
) -> tuple[str, ...]:
    if job_states_by_id is None:
        return ()
    return tuple(job.job_id for job in jobs if job_states_by_id[job.job_id] == state)


def _review_required_job_ids(
    jobs: tuple[ProductionJob, ...],
    job_states_by_id: Mapping[str, str] | None,
) -> tuple[str, ...]:
    if job_states_by_id is None:
        return ()
    return tuple(
        job.job_id
        for job in jobs
        if job_states_by_id[job.job_id] in {"failed", "retryable"}
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


def _handoff_notes(status_source: ProductionHandoffStatusSource = "caller_reported") -> tuple[str, ...]:
    notes = [
        "read-only production wave handoff",
        "no analysis, grading, render, or deliverable files were written",
        "ingest manifest remains the safety boundary before AI/editing work",
    ]
    if status_source == "production_status":
        notes.insert(
            2,
            "completed job IDs were read from trusted production_status.json",
        )
    else:
        notes.insert(
            2,
            "completed job IDs are caller-reported until a persisted production status manifest is used",
        )
    return tuple(notes)
