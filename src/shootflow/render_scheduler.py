from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from shootflow.assembly import AssemblyPlan
from shootflow.render_adapter import (
    DryRunRenderBatchResult,
    run_dry_run_render_batch,
)
from shootflow.render_status import (
    RenderStatusManifest,
    load_render_status_manifest,
)
from shootflow.render_worker import (
    RenderLeasePersistenceResult,
    RenderWorkerActionPlan,
    persist_stale_render_leases,
    plan_render_worker_actions,
    plan_stale_render_leases,
)

_RENDERER_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")


class DryRunRenderSchedulerError(ValueError):
    """Raised when dry-run render scheduling cannot proceed safely."""


@dataclass(frozen=True)
class DryRunRenderSchedulerIteration:
    iteration_number: int
    expired_lease_task_ids: tuple[str, ...]
    conflicted_lease_task_ids: tuple[str, ...]
    attempted_task_ids: tuple[str, ...]
    skipped_retryable_task_ids: tuple[str, ...]
    blocked_task_ids: tuple[str, ...]
    batch_result: DryRunRenderBatchResult | None


@dataclass(frozen=True)
class DryRunRenderSchedulerResult:
    shoot_slug: str
    renderer_adapter: str
    stopped_reason: str
    iterations: tuple[DryRunRenderSchedulerIteration, ...]
    completed_task_ids: tuple[str, ...]
    retryable_task_ids: tuple[str, ...]
    failed_task_ids: tuple[str, ...]
    blocked_task_ids: tuple[str, ...]


def run_dry_run_render_scheduler(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
    completed_dependency_ids: Iterable[str],
    renderer_adapter: str,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
    max_iterations: int,
    stale_before: str | None = None,
    lease_updated_at: str | None = None,
) -> DryRunRenderSchedulerResult:
    """Run dry-run render batches until trusted status has no immediately runnable work.

    The scheduler is a composition layer around existing trust boundaries. Each
    iteration reloads the trusted status manifest, optionally expires stale
    running leases through guarded compare/write updates, plans ready actions,
    and executes those actions through the dry-run batch adapter. A task that
    becomes retryable after an attempt is not hammered again in the same run.
    """

    _validate_scheduler_inputs(
        trusted_plan=trusted_plan,
        renderer_adapter=renderer_adapter,
        started_at=started_at,
        completed_at=completed_at,
        max_concurrency=max_concurrency,
        max_iterations=max_iterations,
        stale_before=stale_before,
        lease_updated_at=lease_updated_at,
    )

    completed_dependencies = _completed_dependency_tuple(completed_dependency_ids)
    attempted_task_ids: set[str] = set()
    iterations: list[DryRunRenderSchedulerIteration] = []

    for iteration_number in range(1, max_iterations + 1):
        status_manifest = load_render_status_manifest(workspace_root, trusted_plan=trusted_plan)
        lease_result = _expire_stale_leases(
            workspace_root,
            trusted_plan=trusted_plan,
            status_manifest=status_manifest,
            stale_before=stale_before,
            lease_updated_at=lease_updated_at,
        )
        if lease_result is not None:
            status_manifest = load_render_status_manifest(workspace_root, trusted_plan=trusted_plan)

        action_plan = plan_render_worker_actions(
            trusted_plan,
            status_manifest,
            completed_dependency_ids=completed_dependencies,
            renderer_adapter=renderer_adapter,
        )
        ready_actions = tuple(
            action for action in action_plan.actions if action.task_id not in attempted_task_ids
        )
        skipped_retryable_task_ids = tuple(
            action.task_id for action in action_plan.actions if action.task_id in attempted_task_ids
        )
        batch_result = None

        if ready_actions:
            attempted_task_ids.update(action.task_id for action in ready_actions)
            batch_result = run_dry_run_render_batch(
                workspace_root,
                trusted_plan=trusted_plan,
                action_plan=RenderWorkerActionPlan(
                    shoot_slug=action_plan.shoot_slug,
                    renderer_adapter=action_plan.renderer_adapter,
                    actions=ready_actions,
                    blocked_tasks=action_plan.blocked_tasks,
                ),
                started_at=started_at,
                completed_at=completed_at,
                max_concurrency=max_concurrency,
            )

        iteration = DryRunRenderSchedulerIteration(
            iteration_number=iteration_number,
            expired_lease_task_ids=_expired_lease_task_ids(lease_result),
            conflicted_lease_task_ids=_conflicted_lease_task_ids(lease_result),
            attempted_task_ids=tuple(action.task_id for action in ready_actions),
            skipped_retryable_task_ids=skipped_retryable_task_ids,
            blocked_task_ids=tuple(blocked.task_id for blocked in action_plan.blocked_tasks),
            batch_result=batch_result,
        )
        _validate_iteration(iteration)
        iterations.append(iteration)

        if not ready_actions:
            final_manifest = load_render_status_manifest(workspace_root, trusted_plan=trusted_plan)
            return _scheduler_result(
                trusted_plan,
                renderer_adapter=renderer_adapter,
                iterations=tuple(iterations),
                final_manifest=final_manifest,
                stopped_reason=_stopped_reason(
                    final_manifest,
                    blocked_task_ids=iteration.blocked_task_ids,
                    skipped_retryable_task_ids=skipped_retryable_task_ids,
                ),
            )

    final_manifest = load_render_status_manifest(workspace_root, trusted_plan=trusted_plan)
    final_action_plan = plan_render_worker_actions(
        trusted_plan,
        final_manifest,
        completed_dependency_ids=completed_dependencies,
        renderer_adapter=renderer_adapter,
    )
    ready_after_cap = tuple(
        action for action in final_action_plan.actions if action.task_id not in attempted_task_ids
    )
    skipped_after_cap = tuple(
        action.task_id for action in final_action_plan.actions if action.task_id in attempted_task_ids
    )
    stopped_reason = "max_iterations"
    if not ready_after_cap:
        stopped_reason = _stopped_reason(
            final_manifest,
            blocked_task_ids=tuple(blocked.task_id for blocked in final_action_plan.blocked_tasks),
            skipped_retryable_task_ids=skipped_after_cap,
        )
    return _scheduler_result(
        trusted_plan,
        renderer_adapter=renderer_adapter,
        iterations=tuple(iterations),
        final_manifest=final_manifest,
        stopped_reason=stopped_reason,
    )


def _validate_scheduler_inputs(
    *,
    trusted_plan: AssemblyPlan,
    renderer_adapter: str,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
    max_iterations: int,
    stale_before: str | None,
    lease_updated_at: str | None,
) -> None:
    if not isinstance(trusted_plan, AssemblyPlan):
        raise DryRunRenderSchedulerError("trusted_plan must be an AssemblyPlan")
    if not isinstance(renderer_adapter, str) or not _RENDERER_PATTERN.fullmatch(renderer_adapter):
        raise DryRunRenderSchedulerError("renderer_adapter is invalid")
    _validate_timestamp(started_at, "started_at")
    _validate_timestamp(completed_at, "completed_at")
    if (
        isinstance(max_concurrency, bool)
        or not isinstance(max_concurrency, int)
        or max_concurrency < 1
    ):
        raise DryRunRenderSchedulerError("max_concurrency must be a positive integer")
    if (
        isinstance(max_iterations, bool)
        or not isinstance(max_iterations, int)
        or max_iterations < 1
    ):
        raise DryRunRenderSchedulerError("max_iterations must be a positive integer")
    if stale_before is None and lease_updated_at is not None:
        raise DryRunRenderSchedulerError("lease_updated_at requires stale_before")
    if stale_before is not None:
        _validate_timestamp(stale_before, "stale_before")
        if lease_updated_at is None:
            raise DryRunRenderSchedulerError("lease_updated_at is required when stale_before is provided")
        _validate_timestamp(lease_updated_at, "lease_updated_at")


def _completed_dependency_tuple(completed_dependency_ids: Iterable[str]) -> tuple[str, ...]:
    if isinstance(completed_dependency_ids, str):
        raise DryRunRenderSchedulerError("completed_dependency_ids must be an iterable of dependency ids")
    try:
        iterator = iter(completed_dependency_ids)
    except TypeError as exc:
        raise DryRunRenderSchedulerError("completed_dependency_ids must be iterable") from exc

    completed: list[str] = []
    for dependency_id in iterator:
        if not isinstance(dependency_id, str) or not dependency_id.strip():
            raise DryRunRenderSchedulerError("completed_dependency_ids must contain non-empty strings")
        completed.append(dependency_id)
    return tuple(completed)


def _validate_timestamp(timestamp: str, label: str) -> None:
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise DryRunRenderSchedulerError(f"{label} must be a non-empty string")
    if len(timestamp) > 80 or "\x00" in timestamp or "\n" in timestamp or "\r" in timestamp:
        raise DryRunRenderSchedulerError(f"{label} is invalid")


def _expire_stale_leases(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
    status_manifest: RenderStatusManifest,
    stale_before: str | None,
    lease_updated_at: str | None,
) -> RenderLeasePersistenceResult | None:
    if stale_before is None:
        return None
    if lease_updated_at is None:
        raise DryRunRenderSchedulerError("lease_updated_at is required when stale_before is provided")
    expiration_plan = plan_stale_render_leases(
        trusted_plan,
        status_manifest,
        stale_before=stale_before,
        updated_at=lease_updated_at,
    )
    if not expiration_plan.expired_leases:
        return None
    return persist_stale_render_leases(
        workspace_root,
        trusted_plan=trusted_plan,
        expiration_plan=expiration_plan,
    )


def _expired_lease_task_ids(result: RenderLeasePersistenceResult | None) -> tuple[str, ...]:
    if result is None:
        return ()
    return tuple(lease.task_id for lease in result.persisted_leases)


def _conflicted_lease_task_ids(result: RenderLeasePersistenceResult | None) -> tuple[str, ...]:
    if result is None:
        return ()
    return tuple(lease.task_id for lease in result.conflicted_leases)


def _stopped_reason(
    final_manifest: RenderStatusManifest,
    *,
    blocked_task_ids: tuple[str, ...],
    skipped_retryable_task_ids: tuple[str, ...],
) -> str:
    states = {status.state for status in final_manifest.task_statuses}
    if "failed" in states:
        return "failed"
    if "retryable" in states and skipped_retryable_task_ids:
        return "retryable"
    if blocked_task_ids:
        return "blocked"
    if "pending" in states or "running" in states or "retryable" in states:
        return "waiting"
    return "complete"


def _scheduler_result(
    trusted_plan: AssemblyPlan,
    *,
    renderer_adapter: str,
    iterations: tuple[DryRunRenderSchedulerIteration, ...],
    final_manifest: RenderStatusManifest,
    stopped_reason: str,
) -> DryRunRenderSchedulerResult:
    result = DryRunRenderSchedulerResult(
        shoot_slug=trusted_plan.shoot_slug,
        renderer_adapter=renderer_adapter,
        stopped_reason=stopped_reason,
        iterations=iterations,
        completed_task_ids=_task_ids_with_state(final_manifest, "succeeded"),
        retryable_task_ids=_task_ids_with_state(final_manifest, "retryable"),
        failed_task_ids=_task_ids_with_state(final_manifest, "failed"),
        blocked_task_ids=_latest_blocked_task_ids(iterations),
    )
    _validate_result(result)
    return result


def _task_ids_with_state(manifest: RenderStatusManifest, state: str) -> tuple[str, ...]:
    return tuple(status.task_id for status in manifest.task_statuses if status.state == state)


def _latest_blocked_task_ids(
    iterations: tuple[DryRunRenderSchedulerIteration, ...],
) -> tuple[str, ...]:
    if not iterations:
        return ()
    return iterations[-1].blocked_task_ids


def _validate_iteration(iteration: DryRunRenderSchedulerIteration) -> None:
    if not isinstance(iteration.iteration_number, int) or iteration.iteration_number < 1:
        raise DryRunRenderSchedulerError("iteration_number must be positive")
    for field_name in (
        "expired_lease_task_ids",
        "conflicted_lease_task_ids",
        "attempted_task_ids",
        "skipped_retryable_task_ids",
        "blocked_task_ids",
    ):
        value = getattr(iteration, field_name)
        if not isinstance(value, tuple):
            raise DryRunRenderSchedulerError(f"{field_name} must be a tuple")
        for task_id in value:
            if not isinstance(task_id, str) or not task_id.strip():
                raise DryRunRenderSchedulerError(f"{field_name} contains an invalid task id")
    if iteration.batch_result is not None and not isinstance(iteration.batch_result, DryRunRenderBatchResult):
        raise DryRunRenderSchedulerError("batch_result is invalid")


def _validate_result(result: DryRunRenderSchedulerResult) -> None:
    if not isinstance(result.shoot_slug, str) or not result.shoot_slug.strip():
        raise DryRunRenderSchedulerError("scheduler result shoot_slug cannot be empty")
    if not isinstance(result.renderer_adapter, str) or not result.renderer_adapter.strip():
        raise DryRunRenderSchedulerError("scheduler result renderer_adapter cannot be empty")
    if result.stopped_reason not in {"complete", "blocked", "retryable", "failed", "waiting", "max_iterations"}:
        raise DryRunRenderSchedulerError("scheduler result stopped_reason is invalid")
    if not isinstance(result.iterations, tuple):
        raise DryRunRenderSchedulerError("scheduler result iterations must be a tuple")
    for iteration in result.iterations:
        _validate_iteration(iteration)
    for field_name in (
        "completed_task_ids",
        "retryable_task_ids",
        "failed_task_ids",
        "blocked_task_ids",
    ):
        value = getattr(result, field_name)
        if not isinstance(value, tuple):
            raise DryRunRenderSchedulerError(f"scheduler result {field_name} must be a tuple")
        for task_id in value:
            if not isinstance(task_id, str) or not task_id.strip():
                raise DryRunRenderSchedulerError(f"scheduler result {field_name} contains an invalid task id")
