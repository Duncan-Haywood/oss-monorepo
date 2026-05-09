from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from shootflow.production import ProductionPlan
from shootflow.production_adapter import (
    DryRunProductionBatchResult,
    DryRunProductionError,
    run_dry_run_production_batch,
    supported_production_adapter_names,
)
from shootflow.production_status import (
    ProductionStatusManifest,
    load_production_status_manifest,
)
from shootflow.production_worker import (
    ProductionWorkerActionPlan,
    plan_production_worker_actions,
)

_WORKER_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")


class DryRunProductionSchedulerError(ValueError):
    """Raised when dry-run production scheduling cannot proceed safely."""


@dataclass(frozen=True)
class DryRunProductionSchedulerIteration:
    iteration_number: int
    attempted_job_ids: tuple[str, ...]
    skipped_retryable_job_ids: tuple[str, ...]
    blocked_job_ids: tuple[str, ...]
    batch_result: DryRunProductionBatchResult | None


@dataclass(frozen=True)
class DryRunProductionSchedulerResult:
    shoot_slug: str
    worker_adapter: str
    stopped_reason: str
    iterations: tuple[DryRunProductionSchedulerIteration, ...]
    completed_job_ids: tuple[str, ...]
    retryable_job_ids: tuple[str, ...]
    failed_job_ids: tuple[str, ...]
    blocked_job_ids: tuple[str, ...]


def run_dry_run_production_scheduler(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    worker_adapter: str,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
    max_iterations: int,
    reviewed_retryable_job_ids: Iterable[str] = (),
) -> DryRunProductionSchedulerResult:
    """Run dry-run production batches until trusted status has no runnable work."""

    _validate_scheduler_inputs(
        trusted_plan=trusted_plan,
        worker_adapter=worker_adapter,
        started_at=started_at,
        completed_at=completed_at,
        max_concurrency=max_concurrency,
        max_iterations=max_iterations,
    )

    reviewed_retryable_jobs = _reviewed_retryable_tuple(
        reviewed_retryable_job_ids,
        trusted_plan=trusted_plan,
    )
    attempted_job_ids: set[str] = set()
    iterations: list[DryRunProductionSchedulerIteration] = []

    for iteration_number in range(1, max_iterations + 1):
        status_manifest = load_production_status_manifest(workspace_root, trusted_plan=trusted_plan)
        statuses_by_id = {status.job_id: status for status in status_manifest.job_statuses}
        action_plan = plan_production_worker_actions(
            trusted_plan,
            status_manifest,
            worker_adapter=worker_adapter,
        )
        ready_actions = tuple(
            action
            for action in action_plan.actions
            if action.job_id not in attempted_job_ids
            and (
                statuses_by_id[action.job_id].state != "retryable"
                or action.job_id in reviewed_retryable_jobs
            )
        )
        skipped_retryable_job_ids = tuple(
            action.job_id
            for action in action_plan.actions
            if action.job_id in attempted_job_ids
            or (
                statuses_by_id[action.job_id].state == "retryable"
                and action.job_id not in reviewed_retryable_jobs
            )
        )
        batch_result = None

        if ready_actions:
            attempted_job_ids.update(action.job_id for action in ready_actions)
            try:
                batch_result = run_dry_run_production_batch(
                    workspace_root,
                    trusted_plan=trusted_plan,
                    action_plan=ProductionWorkerActionPlan(
                        shoot_slug=action_plan.shoot_slug,
                        worker_adapter=action_plan.worker_adapter,
                        actions=ready_actions,
                        blocked_jobs=action_plan.blocked_jobs,
                    ),
                    started_at=started_at,
                    completed_at=completed_at,
                    max_concurrency=max_concurrency,
                )
            except DryRunProductionError as exc:
                raise DryRunProductionSchedulerError(str(exc)) from exc

        iteration = DryRunProductionSchedulerIteration(
            iteration_number=iteration_number,
            attempted_job_ids=tuple(action.job_id for action in ready_actions),
            skipped_retryable_job_ids=skipped_retryable_job_ids,
            blocked_job_ids=tuple(blocked.job_id for blocked in action_plan.blocked_jobs),
            batch_result=batch_result,
        )
        _validate_iteration(iteration)
        iterations.append(iteration)

        if not ready_actions:
            final_manifest = load_production_status_manifest(workspace_root, trusted_plan=trusted_plan)
            return _scheduler_result(
                trusted_plan,
                worker_adapter=worker_adapter,
                iterations=tuple(iterations),
                final_manifest=final_manifest,
                stopped_reason=_stopped_reason(
                    final_manifest,
                    blocked_job_ids=iteration.blocked_job_ids,
                    skipped_retryable_job_ids=skipped_retryable_job_ids,
                ),
            )

    final_manifest = load_production_status_manifest(workspace_root, trusted_plan=trusted_plan)
    final_statuses_by_id = {status.job_id: status for status in final_manifest.job_statuses}
    final_action_plan = plan_production_worker_actions(
        trusted_plan,
        final_manifest,
        worker_adapter=worker_adapter,
    )
    ready_after_cap = tuple(
        action
        for action in final_action_plan.actions
        if action.job_id not in attempted_job_ids
        and (
            final_statuses_by_id[action.job_id].state != "retryable"
            or action.job_id in reviewed_retryable_jobs
        )
    )
    skipped_after_cap = tuple(
        action.job_id
        for action in final_action_plan.actions
        if action.job_id in attempted_job_ids
        or (
            final_statuses_by_id[action.job_id].state == "retryable"
            and action.job_id not in reviewed_retryable_jobs
        )
    )
    stopped_reason = "max_iterations"
    if not ready_after_cap:
        stopped_reason = _stopped_reason(
            final_manifest,
            blocked_job_ids=tuple(blocked.job_id for blocked in final_action_plan.blocked_jobs),
            skipped_retryable_job_ids=skipped_after_cap,
        )
    return _scheduler_result(
        trusted_plan,
        worker_adapter=worker_adapter,
        iterations=tuple(iterations),
        final_manifest=final_manifest,
        stopped_reason=stopped_reason,
    )


def _validate_scheduler_inputs(
    *,
    trusted_plan: ProductionPlan,
    worker_adapter: str,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
    max_iterations: int,
) -> None:
    if not isinstance(trusted_plan, ProductionPlan):
        raise DryRunProductionSchedulerError("trusted_plan must be a ProductionPlan")
    if not isinstance(worker_adapter, str) or not _WORKER_PATTERN.fullmatch(worker_adapter):
        raise DryRunProductionSchedulerError("worker_adapter is invalid")
    if worker_adapter not in supported_production_adapter_names():
        supported_adapters = ", ".join(supported_production_adapter_names()) or "none"
        raise DryRunProductionSchedulerError(
            f"Unsupported production adapter: {worker_adapter}. "
            f"Supported adapters: {supported_adapters}"
        )
    _validate_timestamp(started_at, "started_at")
    _validate_timestamp(completed_at, "completed_at")
    if (
        isinstance(max_concurrency, bool)
        or not isinstance(max_concurrency, int)
        or max_concurrency < 1
    ):
        raise DryRunProductionSchedulerError("max_concurrency must be a positive integer")
    if (
        isinstance(max_iterations, bool)
        or not isinstance(max_iterations, int)
        or max_iterations < 1
    ):
        raise DryRunProductionSchedulerError("max_iterations must be a positive integer")


def _validate_timestamp(timestamp: str, label: str) -> None:
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise DryRunProductionSchedulerError(f"{label} must be a non-empty string")
    if len(timestamp) > 80 or "\x00" in timestamp or "\n" in timestamp or "\r" in timestamp:
        raise DryRunProductionSchedulerError(f"{label} is invalid")


def _reviewed_retryable_tuple(
    reviewed_retryable_job_ids: Iterable[str],
    *,
    trusted_plan: ProductionPlan,
) -> tuple[str, ...]:
    if isinstance(reviewed_retryable_job_ids, str):
        raise DryRunProductionSchedulerError("reviewed_retryable_job_ids must be an iterable of job ids")
    try:
        iterator = iter(reviewed_retryable_job_ids)
    except TypeError as exc:
        raise DryRunProductionSchedulerError("reviewed_retryable_job_ids must be iterable") from exc
    known_job_ids = {job.job_id for job in trusted_plan.jobs}
    reviewed: list[str] = []
    seen: set[str] = set()
    for job_id in iterator:
        if not isinstance(job_id, str) or not job_id.strip():
            raise DryRunProductionSchedulerError("reviewed_retryable_job_ids must contain non-empty strings")
        if job_id not in known_job_ids:
            raise DryRunProductionSchedulerError(f"Unknown reviewed retryable production job: {job_id}")
        if job_id in seen:
            raise DryRunProductionSchedulerError(f"Duplicate reviewed retryable production job: {job_id}")
        seen.add(job_id)
        reviewed.append(job_id)
    return tuple(reviewed)


def _stopped_reason(
    final_manifest: ProductionStatusManifest,
    *,
    blocked_job_ids: tuple[str, ...],
    skipped_retryable_job_ids: tuple[str, ...],
) -> str:
    states = {status.state for status in final_manifest.job_statuses}
    if "failed" in states:
        return "failed"
    if "retryable" in states and skipped_retryable_job_ids:
        return "retryable"
    if blocked_job_ids:
        return "blocked"
    if "pending" in states or "running" in states or "retryable" in states:
        return "waiting"
    return "complete"


def _scheduler_result(
    trusted_plan: ProductionPlan,
    *,
    worker_adapter: str,
    iterations: tuple[DryRunProductionSchedulerIteration, ...],
    final_manifest: ProductionStatusManifest,
    stopped_reason: str,
) -> DryRunProductionSchedulerResult:
    result = DryRunProductionSchedulerResult(
        shoot_slug=trusted_plan.shoot_slug,
        worker_adapter=worker_adapter,
        stopped_reason=stopped_reason,
        iterations=iterations,
        completed_job_ids=_job_ids_with_state(final_manifest, "succeeded"),
        retryable_job_ids=_job_ids_with_state(final_manifest, "retryable"),
        failed_job_ids=_job_ids_with_state(final_manifest, "failed"),
        blocked_job_ids=_latest_blocked_job_ids(iterations),
    )
    _validate_result(result)
    return result


def _job_ids_with_state(manifest: ProductionStatusManifest, state: str) -> tuple[str, ...]:
    return tuple(status.job_id for status in manifest.job_statuses if status.state == state)


def _latest_blocked_job_ids(
    iterations: tuple[DryRunProductionSchedulerIteration, ...],
) -> tuple[str, ...]:
    if not iterations:
        return ()
    return iterations[-1].blocked_job_ids


def _validate_iteration(iteration: DryRunProductionSchedulerIteration) -> None:
    if not isinstance(iteration.iteration_number, int) or iteration.iteration_number < 1:
        raise DryRunProductionSchedulerError("iteration_number must be positive")
    for field_name in (
        "attempted_job_ids",
        "skipped_retryable_job_ids",
        "blocked_job_ids",
    ):
        value = getattr(iteration, field_name)
        if not isinstance(value, tuple):
            raise DryRunProductionSchedulerError(f"{field_name} must be a tuple")
        for job_id in value:
            if not isinstance(job_id, str) or not job_id.strip():
                raise DryRunProductionSchedulerError(f"{field_name} contains an invalid job id")
    if iteration.batch_result is not None and not isinstance(iteration.batch_result, DryRunProductionBatchResult):
        raise DryRunProductionSchedulerError("batch_result is invalid")


def _validate_result(result: DryRunProductionSchedulerResult) -> None:
    if not isinstance(result.shoot_slug, str) or not result.shoot_slug.strip():
        raise DryRunProductionSchedulerError("scheduler result shoot_slug cannot be empty")
    if not isinstance(result.worker_adapter, str) or not result.worker_adapter.strip():
        raise DryRunProductionSchedulerError("scheduler result worker_adapter cannot be empty")
    if result.stopped_reason not in {"complete", "blocked", "retryable", "failed", "waiting", "max_iterations"}:
        raise DryRunProductionSchedulerError("scheduler result stopped_reason is invalid")
    if not isinstance(result.iterations, tuple):
        raise DryRunProductionSchedulerError("scheduler result iterations must be a tuple")
    for iteration in result.iterations:
        _validate_iteration(iteration)
    for field_name in (
        "completed_job_ids",
        "retryable_job_ids",
        "failed_job_ids",
        "blocked_job_ids",
    ):
        value = getattr(result, field_name)
        if not isinstance(value, tuple):
            raise DryRunProductionSchedulerError(f"scheduler result {field_name} must be a tuple")
        for job_id in value:
            if not isinstance(job_id, str) or not job_id.strip():
                raise DryRunProductionSchedulerError(f"scheduler result {field_name} contains an invalid job id")
