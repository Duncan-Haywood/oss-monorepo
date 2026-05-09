from __future__ import annotations

import json
import os
import re
import uuid
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType

from shootflow.assembly import AssemblyPlan
from shootflow.render_adapter import (
    DryRunRenderBatchResult,
    DryRunRendererError,
    run_render_adapter_batch,
    supported_render_adapter_names,
)
from shootflow.render_status import (
    RenderStatusManifest,
    load_render_status_manifest,
    render_plan_fingerprint,
    validate_render_status_manifest,
)
from shootflow.render_worker import (
    RenderLeasePersistenceResult,
    RenderWorkerActionPlan,
    persist_stale_render_leases,
    plan_render_worker_actions,
    plan_stale_render_leases,
)

_RENDERER_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")
RENDER_SCHEDULER_REPORT_PATH = "deliverables/render_scheduler_report.json"
_REPORT_SCHEMA_VERSION = 2
_SUPPORTED_REPORT_SCHEMA_VERSIONS = frozenset({1, 2})
_REPORT_KEYS = frozenset(
    {
        "schema_version",
        "generated_at",
        "shoot_slug",
        "render_plan_fingerprint",
        "renderer_adapter",
        "stopped_reason",
        "iteration_count",
        "total_task_count",
        "completed_task_ids",
        "retryable_task_ids",
        "failed_task_ids",
        "blocked_task_ids",
        "attempted_task_ids",
        "skipped_retryable_task_ids",
        "expired_lease_task_ids",
        "conflicted_lease_task_ids",
        "review_required_task_ids",
        "outputs_materialized",
        "failure_messages",
        "product_metrics",
    }
)
_MESSAGE_KEYS = frozenset({"task_id", "message"})
_PRODUCT_METRIC_NAMES = frozenset(
    {
        "total_task_count",
        "completed_task_count",
        "retryable_task_count",
        "failed_task_count",
        "blocked_task_count",
        "review_required_task_count",
        "attempted_task_count",
        "skipped_retryable_task_count",
        "expired_lease_task_count",
        "conflicted_lease_task_count",
        "materialized_output_count",
        "failure_message_count",
        "iteration_count",
    }
)


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


@dataclass(frozen=True)
class SchedulerTaskMessage:
    task_id: str
    message: str


@dataclass(frozen=True)
class DryRunRenderSchedulerReport:
    generated_at: str
    shoot_slug: str
    render_plan_fingerprint: str
    renderer_adapter: str
    stopped_reason: str
    iteration_count: int
    total_task_count: int
    completed_task_ids: tuple[str, ...]
    retryable_task_ids: tuple[str, ...]
    failed_task_ids: tuple[str, ...]
    blocked_task_ids: tuple[str, ...]
    attempted_task_ids: tuple[str, ...]
    skipped_retryable_task_ids: tuple[str, ...]
    expired_lease_task_ids: tuple[str, ...]
    conflicted_lease_task_ids: tuple[str, ...]
    review_required_task_ids: tuple[str, ...]
    outputs_materialized: tuple[str, ...]
    failure_messages: tuple[SchedulerTaskMessage, ...]
    product_metrics: Mapping[str, int]


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
            try:
                batch_result = run_render_adapter_batch(
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
            except DryRunRendererError as exc:
                raise DryRunRenderSchedulerError(str(exc)) from exc

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


def write_dry_run_render_scheduler_report(
    result: DryRunRenderSchedulerResult,
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
    final_manifest: RenderStatusManifest,
    generated_at: str,
) -> Path:
    """Persist an actionable scheduler summary for UI, retry, and continuation agents."""

    report = _scheduler_report(
        result,
        trusted_plan=trusted_plan,
        final_manifest=final_manifest,
        generated_at=generated_at,
    )
    report_path = _render_scheduler_report_path(workspace_root)
    root = _workspace_root(workspace_root)
    _reject_symlink_path(report_path.parent, root, "render scheduler report directory")
    try:
        report_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise DryRunRenderSchedulerError(
            f"Unable to create render scheduler report directory: {report_path.parent}"
        ) from exc
    _reject_symlink_path(report_path.parent, root, "render scheduler report directory")
    _reject_symlink_path(report_path, root, "render scheduler report")
    _write_report_text(report_path, root=root, content=_report_json(report))
    return report_path


def load_dry_run_render_scheduler_report(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
    final_manifest: RenderStatusManifest,
) -> DryRunRenderSchedulerReport:
    """Load a persisted scheduler report only when it still matches the trusted plan/status."""

    report_path = _render_scheduler_report_path(workspace_root)
    root = _workspace_root(workspace_root)
    _reject_symlink_path(report_path.parent, root, "render scheduler report directory")
    _reject_symlink_path(report_path, root, "render scheduler report")
    report = _report_from_json(_read_json_object(report_path))
    _validate_report(report, trusted_plan=trusted_plan, final_manifest=final_manifest)
    return report


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
    if renderer_adapter not in supported_render_adapter_names():
        supported_adapters = ", ".join(supported_render_adapter_names()) or "none"
        raise DryRunRenderSchedulerError(
            f"Unsupported renderer adapter: {renderer_adapter}. "
            f"Supported adapters: {supported_adapters}"
        )
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


def _scheduler_report(
    result: DryRunRenderSchedulerResult,
    *,
    trusted_plan: AssemblyPlan,
    final_manifest: RenderStatusManifest,
    generated_at: str,
) -> DryRunRenderSchedulerReport:
    _validate_timestamp(generated_at, "generated_at")
    validate_render_status_manifest(final_manifest, trusted_plan=trusted_plan)
    _validate_result(result)
    if result.shoot_slug != trusted_plan.shoot_slug:
        raise DryRunRenderSchedulerError("scheduler result shoot_slug does not match trusted plan")
    attempted_task_ids = _unique_iteration_task_ids(result.iterations, "attempted_task_ids")
    skipped_retryable_task_ids = _unique_iteration_task_ids(
        result.iterations,
        "skipped_retryable_task_ids",
    )
    expired_lease_task_ids = _unique_iteration_task_ids(result.iterations, "expired_lease_task_ids")
    conflicted_lease_task_ids = _unique_iteration_task_ids(
        result.iterations,
        "conflicted_lease_task_ids",
    )
    review_required_task_ids = _review_required_task_ids(result)
    outputs_materialized = _outputs_materialized(result.iterations)
    failure_messages = _failure_messages(result.iterations, final_manifest)
    report = DryRunRenderSchedulerReport(
        generated_at=generated_at,
        shoot_slug=trusted_plan.shoot_slug,
        render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
        renderer_adapter=result.renderer_adapter,
        stopped_reason=result.stopped_reason,
        iteration_count=len(result.iterations),
        total_task_count=len(final_manifest.task_statuses),
        completed_task_ids=result.completed_task_ids,
        retryable_task_ids=result.retryable_task_ids,
        failed_task_ids=result.failed_task_ids,
        blocked_task_ids=result.blocked_task_ids,
        attempted_task_ids=attempted_task_ids,
        skipped_retryable_task_ids=skipped_retryable_task_ids,
        expired_lease_task_ids=expired_lease_task_ids,
        conflicted_lease_task_ids=conflicted_lease_task_ids,
        review_required_task_ids=review_required_task_ids,
        outputs_materialized=outputs_materialized,
        failure_messages=failure_messages,
        product_metrics=_product_metrics(
            iteration_count=len(result.iterations),
            total_task_count=len(final_manifest.task_statuses),
            completed_task_ids=result.completed_task_ids,
            retryable_task_ids=result.retryable_task_ids,
            failed_task_ids=result.failed_task_ids,
            blocked_task_ids=result.blocked_task_ids,
            review_required_task_ids=review_required_task_ids,
            attempted_task_ids=attempted_task_ids,
            skipped_retryable_task_ids=skipped_retryable_task_ids,
            expired_lease_task_ids=expired_lease_task_ids,
            conflicted_lease_task_ids=conflicted_lease_task_ids,
            outputs_materialized=outputs_materialized,
            failure_messages=failure_messages,
        ),
    )
    _validate_report(report, trusted_plan=trusted_plan, final_manifest=final_manifest)
    return report


def _unique_iteration_task_ids(
    iterations: tuple[DryRunRenderSchedulerIteration, ...],
    field_name: str,
) -> tuple[str, ...]:
    seen: set[str] = set()
    ordered: list[str] = []
    for iteration in iterations:
        for task_id in getattr(iteration, field_name):
            if task_id in seen:
                continue
            seen.add(task_id)
            ordered.append(task_id)
    return tuple(ordered)


def _review_required_task_ids(result: DryRunRenderSchedulerResult) -> tuple[str, ...]:
    seen: set[str] = set()
    ordered: list[str] = []
    for task_id in (
        result.retryable_task_ids
        + result.failed_task_ids
        + result.blocked_task_ids
        + _unique_iteration_task_ids(result.iterations, "conflicted_lease_task_ids")
    ):
        if task_id in seen:
            continue
        seen.add(task_id)
        ordered.append(task_id)
    return tuple(ordered)


def _outputs_materialized(
    iterations: tuple[DryRunRenderSchedulerIteration, ...],
) -> tuple[str, ...]:
    outputs: list[str] = []
    for iteration in iterations:
        if iteration.batch_result is None:
            continue
        for result in iteration.batch_result.results:
            outputs.extend(result.outputs_materialized)
    return tuple(outputs)


def _failure_messages(
    iterations: tuple[DryRunRenderSchedulerIteration, ...],
    final_manifest: RenderStatusManifest,
) -> tuple[SchedulerTaskMessage, ...]:
    messages: list[SchedulerTaskMessage] = []
    for iteration in iterations:
        if iteration.batch_result is None:
            continue
        for failure in iteration.batch_result.failures:
            messages.append(SchedulerTaskMessage(task_id=failure.task_id, message=failure.error_message))
        for result in iteration.batch_result.results:
            final_status = result.final_status
            if final_status.state in {"retryable", "failed"} and final_status.error_message is not None:
                messages.append(
                    SchedulerTaskMessage(
                        task_id=final_status.task_id,
                        message=final_status.error_message,
                    )
                )
    messaged_task_ids = {message.task_id for message in messages}
    for status in final_manifest.task_statuses:
        if (
            status.state in {"retryable", "failed"}
            and status.error_message is not None
            and status.task_id not in messaged_task_ids
        ):
            messages.append(SchedulerTaskMessage(task_id=status.task_id, message=status.error_message))
    return tuple(messages)


def _report_json(report: DryRunRenderSchedulerReport) -> str:
    _validate_report_shape(report)
    return json.dumps(
        _report_to_json(report),
        ensure_ascii=True,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _report_to_json(report: DryRunRenderSchedulerReport) -> dict[str, object]:
    return {
        "schema_version": _REPORT_SCHEMA_VERSION,
        "generated_at": report.generated_at,
        "shoot_slug": report.shoot_slug,
        "render_plan_fingerprint": report.render_plan_fingerprint,
        "renderer_adapter": report.renderer_adapter,
        "stopped_reason": report.stopped_reason,
        "iteration_count": report.iteration_count,
        "total_task_count": report.total_task_count,
        "completed_task_ids": list(report.completed_task_ids),
        "retryable_task_ids": list(report.retryable_task_ids),
        "failed_task_ids": list(report.failed_task_ids),
        "blocked_task_ids": list(report.blocked_task_ids),
        "attempted_task_ids": list(report.attempted_task_ids),
        "skipped_retryable_task_ids": list(report.skipped_retryable_task_ids),
        "expired_lease_task_ids": list(report.expired_lease_task_ids),
        "conflicted_lease_task_ids": list(report.conflicted_lease_task_ids),
        "review_required_task_ids": list(report.review_required_task_ids),
        "outputs_materialized": list(report.outputs_materialized),
        "failure_messages": [
            {"task_id": message.task_id, "message": message.message}
            for message in report.failure_messages
        ],
        "product_metrics": dict(report.product_metrics),
    }


def _report_from_json(raw_report: dict[str, object]) -> DryRunRenderSchedulerReport:
    unknown_keys = set(raw_report) - _REPORT_KEYS
    raw_schema_version = raw_report.get("schema_version")
    if raw_schema_version not in _SUPPORTED_REPORT_SCHEMA_VERSIONS:
        raise DryRunRenderSchedulerError("Render scheduler report schema_version is unsupported")
    required_keys = _REPORT_KEYS
    if raw_schema_version == 1:
        required_keys = _REPORT_KEYS - {"product_metrics"}
    missing_keys = required_keys - set(raw_report)
    if unknown_keys:
        raise DryRunRenderSchedulerError(
            f"Render scheduler report contains unknown fields: {sorted(unknown_keys)}"
        )
    if missing_keys:
        raise DryRunRenderSchedulerError(
            f"Render scheduler report is missing fields: {sorted(missing_keys)}"
        )
    iteration_count = _json_non_negative_int(raw_report["iteration_count"], "iteration_count")
    total_task_count = _json_non_negative_int(raw_report["total_task_count"], "total_task_count")
    completed_task_ids = _json_string_tuple(raw_report["completed_task_ids"], "completed_task_ids")
    retryable_task_ids = _json_string_tuple(raw_report["retryable_task_ids"], "retryable_task_ids")
    failed_task_ids = _json_string_tuple(raw_report["failed_task_ids"], "failed_task_ids")
    blocked_task_ids = _json_string_tuple(raw_report["blocked_task_ids"], "blocked_task_ids")
    attempted_task_ids = _json_string_tuple(raw_report["attempted_task_ids"], "attempted_task_ids")
    skipped_retryable_task_ids = _json_string_tuple(
        raw_report["skipped_retryable_task_ids"],
        "skipped_retryable_task_ids",
    )
    expired_lease_task_ids = _json_string_tuple(
        raw_report["expired_lease_task_ids"],
        "expired_lease_task_ids",
    )
    conflicted_lease_task_ids = _json_string_tuple(
        raw_report["conflicted_lease_task_ids"],
        "conflicted_lease_task_ids",
    )
    review_required_task_ids = _json_string_tuple(
        raw_report["review_required_task_ids"],
        "review_required_task_ids",
    )
    outputs_materialized = _json_string_tuple(
        raw_report["outputs_materialized"],
        "outputs_materialized",
    )
    failure_messages = _json_task_messages(raw_report["failure_messages"])
    product_metrics = (
        _json_product_metrics(raw_report["product_metrics"])
        if "product_metrics" in raw_report
        else _product_metrics(
            iteration_count=iteration_count,
            total_task_count=total_task_count,
            completed_task_ids=completed_task_ids,
            retryable_task_ids=retryable_task_ids,
            failed_task_ids=failed_task_ids,
            blocked_task_ids=blocked_task_ids,
            review_required_task_ids=review_required_task_ids,
            attempted_task_ids=attempted_task_ids,
            skipped_retryable_task_ids=skipped_retryable_task_ids,
            expired_lease_task_ids=expired_lease_task_ids,
            conflicted_lease_task_ids=conflicted_lease_task_ids,
            outputs_materialized=outputs_materialized,
            failure_messages=failure_messages,
        )
    )
    return DryRunRenderSchedulerReport(
        generated_at=_json_string(raw_report["generated_at"], "generated_at"),
        shoot_slug=_json_string(raw_report["shoot_slug"], "shoot_slug"),
        render_plan_fingerprint=_json_string(
            raw_report["render_plan_fingerprint"],
            "render_plan_fingerprint",
        ),
        renderer_adapter=_json_string(raw_report["renderer_adapter"], "renderer_adapter"),
        stopped_reason=_json_string(raw_report["stopped_reason"], "stopped_reason"),
        iteration_count=iteration_count,
        total_task_count=total_task_count,
        completed_task_ids=completed_task_ids,
        retryable_task_ids=retryable_task_ids,
        failed_task_ids=failed_task_ids,
        blocked_task_ids=blocked_task_ids,
        attempted_task_ids=attempted_task_ids,
        skipped_retryable_task_ids=skipped_retryable_task_ids,
        expired_lease_task_ids=expired_lease_task_ids,
        conflicted_lease_task_ids=conflicted_lease_task_ids,
        review_required_task_ids=review_required_task_ids,
        outputs_materialized=outputs_materialized,
        failure_messages=failure_messages,
        product_metrics=product_metrics,
    )


def _json_task_messages(raw_messages: object) -> tuple[SchedulerTaskMessage, ...]:
    if not isinstance(raw_messages, list):
        raise DryRunRenderSchedulerError("failure_messages must be a list")
    messages: list[SchedulerTaskMessage] = []
    for raw_message in raw_messages:
        if not isinstance(raw_message, dict):
            raise DryRunRenderSchedulerError("failure_messages must contain objects")
        unknown_keys = set(raw_message) - _MESSAGE_KEYS
        missing_keys = _MESSAGE_KEYS - set(raw_message)
        if unknown_keys:
            raise DryRunRenderSchedulerError(
                f"failure_messages contains unknown fields: {sorted(unknown_keys)}"
            )
        if missing_keys:
            raise DryRunRenderSchedulerError(
                f"failure_messages is missing fields: {sorted(missing_keys)}"
            )
        messages.append(
            SchedulerTaskMessage(
                task_id=_json_string(raw_message["task_id"], "failure_messages.task_id"),
                message=_json_string(raw_message["message"], "failure_messages.message"),
            )
        )
    return tuple(messages)


def _json_string(value: object, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise DryRunRenderSchedulerError(f"{field_name} must be a non-empty string")
    return value


def _json_non_negative_int(value: object, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise DryRunRenderSchedulerError(f"{field_name} must be a non-negative integer")
    return value


def _json_string_tuple(value: object, field_name: str) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise DryRunRenderSchedulerError(f"{field_name} must be a list")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise DryRunRenderSchedulerError(f"{field_name} must contain non-empty strings")
        result.append(item)
    return tuple(result)


def _json_product_metrics(raw_metrics: object) -> Mapping[str, int]:
    if not isinstance(raw_metrics, dict):
        raise DryRunRenderSchedulerError("product_metrics must be an object")
    unknown_keys = set(raw_metrics) - _PRODUCT_METRIC_NAMES
    missing_keys = _PRODUCT_METRIC_NAMES - set(raw_metrics)
    if unknown_keys:
        raise DryRunRenderSchedulerError(
            f"product_metrics contains unknown metrics: {sorted(unknown_keys)}"
        )
    if missing_keys:
        raise DryRunRenderSchedulerError(
            f"product_metrics is missing metrics: {sorted(missing_keys)}"
        )
    metrics: dict[str, int] = {}
    for name in sorted(_PRODUCT_METRIC_NAMES):
        value = raw_metrics[name]
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise DryRunRenderSchedulerError(f"product_metrics {name} must be a non-negative integer")
        metrics[name] = value
    return _freeze_product_metrics(metrics)


def _validate_report(
    report: DryRunRenderSchedulerReport,
    *,
    trusted_plan: AssemblyPlan,
    final_manifest: RenderStatusManifest,
) -> None:
    validate_render_status_manifest(final_manifest, trusted_plan=trusted_plan)
    _validate_report_shape(report)
    expected_fingerprint = render_plan_fingerprint(trusted_plan)
    if report.shoot_slug != trusted_plan.shoot_slug:
        raise DryRunRenderSchedulerError("Render scheduler report shoot_slug does not match trusted plan")
    if report.render_plan_fingerprint != expected_fingerprint:
        raise DryRunRenderSchedulerError(
            "Render scheduler report fingerprint does not match trusted plan"
        )
    if report.total_task_count != len(final_manifest.task_statuses):
        raise DryRunRenderSchedulerError("Render scheduler report task count does not match final status")
    manifest_statuses = {status.task_id: status for status in final_manifest.task_statuses}
    if set(report.completed_task_ids) != _manifest_task_ids_with_state(final_manifest, "succeeded"):
        raise DryRunRenderSchedulerError("Render scheduler report completed tasks do not match final status")
    if set(report.retryable_task_ids) != _manifest_task_ids_with_state(final_manifest, "retryable"):
        raise DryRunRenderSchedulerError("Render scheduler report retryable tasks do not match final status")
    if set(report.failed_task_ids) != _manifest_task_ids_with_state(final_manifest, "failed"):
        raise DryRunRenderSchedulerError("Render scheduler report failed tasks do not match final status")
    known_task_ids = set(manifest_statuses)
    for field_name in (
        "completed_task_ids",
        "retryable_task_ids",
        "failed_task_ids",
        "blocked_task_ids",
        "attempted_task_ids",
        "skipped_retryable_task_ids",
        "expired_lease_task_ids",
        "conflicted_lease_task_ids",
        "review_required_task_ids",
    ):
        task_ids = getattr(report, field_name)
        unknown = set(task_ids) - known_task_ids
        if unknown:
            raise DryRunRenderSchedulerError(
                f"Render scheduler report {field_name} contains unknown tasks: {sorted(unknown)}"
            )
    _validate_report_blocked_tasks(report, manifest_statuses)
    _validate_report_stopped_reason(report, final_manifest)
    expected_review_required = _ordered_unique(
        report.retryable_task_ids
        + report.failed_task_ids
        + report.blocked_task_ids
        + report.conflicted_lease_task_ids
    )
    if report.review_required_task_ids != expected_review_required:
        raise DryRunRenderSchedulerError(
            "Render scheduler report review_required_task_ids are inconsistent"
        )
    expected_output_paths = {
        output.path
        for status in final_manifest.task_statuses
        if status.state == "succeeded"
        for output in status.output_checksums
    }
    for output_path in report.outputs_materialized:
        if output_path not in expected_output_paths:
            raise DryRunRenderSchedulerError(
                "Render scheduler report outputs_materialized contains unknown outputs"
            )
    message_task_ids = {message.task_id for message in report.failure_messages}
    if message_task_ids - known_task_ids:
        raise DryRunRenderSchedulerError("Render scheduler report failure_messages contain unknown tasks")
    for message in report.failure_messages:
        if manifest_statuses[message.task_id].state == "succeeded":
            raise DryRunRenderSchedulerError(
                "Render scheduler report failure_messages cannot describe succeeded tasks"
            )
    if report.product_metrics != _product_metrics_from_report(report):
        raise DryRunRenderSchedulerError("Render scheduler report product_metrics are inconsistent")


def _validate_report_blocked_tasks(
    report: DryRunRenderSchedulerReport,
    manifest_statuses: dict[str, object],
) -> None:
    for task_id in report.blocked_task_ids:
        status = manifest_statuses[task_id]
        if getattr(status, "state") not in {"pending", "retryable"}:
            raise DryRunRenderSchedulerError(
                "Render scheduler report blocked_task_ids conflict with final status"
            )
    for task_id in report.skipped_retryable_task_ids:
        status = manifest_statuses[task_id]
        if getattr(status, "state") != "retryable":
            raise DryRunRenderSchedulerError(
                "Render scheduler report skipped_retryable_task_ids conflict with final status"
            )


def _validate_report_stopped_reason(
    report: DryRunRenderSchedulerReport,
    final_manifest: RenderStatusManifest,
) -> None:
    states = {status.state for status in final_manifest.task_statuses}
    has_unfinished = bool(states & {"pending", "running", "retryable"})
    if report.stopped_reason == "complete":
        if states not in (set(), {"succeeded"}) or report.review_required_task_ids:
            raise DryRunRenderSchedulerError(
                "Render scheduler report stopped_reason conflicts with final status"
            )
        return
    if report.stopped_reason == "failed":
        if "failed" not in states:
            raise DryRunRenderSchedulerError(
                "Render scheduler report stopped_reason conflicts with final status"
            )
        return
    if report.stopped_reason == "retryable":
        if not report.retryable_task_ids:
            raise DryRunRenderSchedulerError(
                "Render scheduler report stopped_reason conflicts with final status"
            )
        return
    if report.stopped_reason == "blocked":
        if not report.blocked_task_ids:
            raise DryRunRenderSchedulerError(
                "Render scheduler report stopped_reason conflicts with final status"
            )
        return
    if report.stopped_reason == "waiting":
        if "failed" in states or not has_unfinished:
            raise DryRunRenderSchedulerError(
                "Render scheduler report stopped_reason conflicts with final status"
            )
        return
    if report.stopped_reason == "max_iterations":
        if not has_unfinished and "failed" not in states:
            raise DryRunRenderSchedulerError(
                "Render scheduler report stopped_reason conflicts with final status"
            )


def _manifest_task_ids_with_state(manifest: RenderStatusManifest, state: str) -> set[str]:
    return {status.task_id for status in manifest.task_statuses if status.state == state}


def _ordered_unique(task_ids: tuple[str, ...]) -> tuple[str, ...]:
    seen: set[str] = set()
    ordered: list[str] = []
    for task_id in task_ids:
        if task_id in seen:
            continue
        seen.add(task_id)
        ordered.append(task_id)
    return tuple(ordered)


def _validate_report_shape(report: DryRunRenderSchedulerReport) -> None:
    if not isinstance(report, DryRunRenderSchedulerReport):
        raise DryRunRenderSchedulerError("report must be a DryRunRenderSchedulerReport")
    _validate_timestamp(report.generated_at, "generated_at")
    if not isinstance(report.shoot_slug, str) or not report.shoot_slug.strip():
        raise DryRunRenderSchedulerError("report shoot_slug cannot be empty")
    if not isinstance(report.render_plan_fingerprint, str) or not report.render_plan_fingerprint.strip():
        raise DryRunRenderSchedulerError("report render_plan_fingerprint cannot be empty")
    if not isinstance(report.renderer_adapter, str) or not _RENDERER_PATTERN.fullmatch(report.renderer_adapter):
        raise DryRunRenderSchedulerError("report renderer_adapter is invalid")
    if report.stopped_reason not in {"complete", "blocked", "retryable", "failed", "waiting", "max_iterations"}:
        raise DryRunRenderSchedulerError("report stopped_reason is invalid")
    for field_name in ("iteration_count", "total_task_count"):
        value = getattr(report, field_name)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise DryRunRenderSchedulerError(f"report {field_name} must be a non-negative integer")
    for field_name in (
        "completed_task_ids",
        "retryable_task_ids",
        "failed_task_ids",
        "blocked_task_ids",
        "attempted_task_ids",
        "skipped_retryable_task_ids",
        "expired_lease_task_ids",
        "conflicted_lease_task_ids",
        "review_required_task_ids",
        "outputs_materialized",
    ):
        value = getattr(report, field_name)
        if not isinstance(value, tuple):
            raise DryRunRenderSchedulerError(f"report {field_name} must be a tuple")
        for item in value:
            if not isinstance(item, str) or not item.strip():
                raise DryRunRenderSchedulerError(f"report {field_name} contains invalid strings")
        _reject_duplicate_strings(value, f"report {field_name}")
    if not isinstance(report.failure_messages, tuple):
        raise DryRunRenderSchedulerError("report failure_messages must be a tuple")
    for message in report.failure_messages:
        if not isinstance(message, SchedulerTaskMessage):
            raise DryRunRenderSchedulerError("report failure_messages contains invalid messages")
        if not isinstance(message.task_id, str) or not message.task_id.strip():
            raise DryRunRenderSchedulerError("report failure_messages contains invalid task_id")
        if not isinstance(message.message, str) or not message.message.strip():
            raise DryRunRenderSchedulerError("report failure_messages contains invalid message")
    _validate_product_metrics(report.product_metrics)


def _validate_product_metrics(metrics: Mapping[str, int]) -> None:
    if not isinstance(metrics, Mapping):
        raise DryRunRenderSchedulerError("report product_metrics must be a mapping")
    unknown_keys = set(metrics) - _PRODUCT_METRIC_NAMES
    missing_keys = _PRODUCT_METRIC_NAMES - set(metrics)
    if unknown_keys:
        raise DryRunRenderSchedulerError(
            f"report product_metrics contains unknown metrics: {sorted(unknown_keys)}"
        )
    if missing_keys:
        raise DryRunRenderSchedulerError(
            f"report product_metrics is missing metrics: {sorted(missing_keys)}"
        )
    for name, value in metrics.items():
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise DryRunRenderSchedulerError(
                f"report product_metrics {name} must be a non-negative integer"
            )


def _product_metrics_from_report(report: DryRunRenderSchedulerReport) -> Mapping[str, int]:
    return _product_metrics(
        iteration_count=report.iteration_count,
        total_task_count=report.total_task_count,
        completed_task_ids=report.completed_task_ids,
        retryable_task_ids=report.retryable_task_ids,
        failed_task_ids=report.failed_task_ids,
        blocked_task_ids=report.blocked_task_ids,
        review_required_task_ids=report.review_required_task_ids,
        attempted_task_ids=report.attempted_task_ids,
        skipped_retryable_task_ids=report.skipped_retryable_task_ids,
        expired_lease_task_ids=report.expired_lease_task_ids,
        conflicted_lease_task_ids=report.conflicted_lease_task_ids,
        outputs_materialized=report.outputs_materialized,
        failure_messages=report.failure_messages,
    )


def _product_metrics(
    *,
    iteration_count: int,
    total_task_count: int,
    completed_task_ids: tuple[str, ...],
    retryable_task_ids: tuple[str, ...],
    failed_task_ids: tuple[str, ...],
    blocked_task_ids: tuple[str, ...],
    review_required_task_ids: tuple[str, ...],
    attempted_task_ids: tuple[str, ...],
    skipped_retryable_task_ids: tuple[str, ...],
    expired_lease_task_ids: tuple[str, ...],
    conflicted_lease_task_ids: tuple[str, ...],
    outputs_materialized: tuple[str, ...],
    failure_messages: tuple[SchedulerTaskMessage, ...],
) -> Mapping[str, int]:
    return _freeze_product_metrics({
        "attempted_task_count": len(attempted_task_ids),
        "blocked_task_count": len(blocked_task_ids),
        "completed_task_count": len(completed_task_ids),
        "conflicted_lease_task_count": len(conflicted_lease_task_ids),
        "expired_lease_task_count": len(expired_lease_task_ids),
        "failed_task_count": len(failed_task_ids),
        "failure_message_count": len(failure_messages),
        "iteration_count": iteration_count,
        "materialized_output_count": len(outputs_materialized),
        "retryable_task_count": len(retryable_task_ids),
        "review_required_task_count": len(review_required_task_ids),
        "skipped_retryable_task_count": len(skipped_retryable_task_ids),
        "total_task_count": total_task_count,
    })


def _freeze_product_metrics(metrics: dict[str, int]) -> Mapping[str, int]:
    return MappingProxyType(dict(metrics))


def _reject_duplicate_strings(values: tuple[str, ...], field_name: str) -> None:
    seen: set[str] = set()
    for value in values:
        if value in seen:
            raise DryRunRenderSchedulerError(f"{field_name} contains duplicate value: {value}")
        seen.add(value)


def _render_scheduler_report_path(workspace_root: Path | str) -> Path:
    return _workspace_root(workspace_root) / RENDER_SCHEDULER_REPORT_PATH


def _workspace_root(workspace_root: Path | str) -> Path:
    root = Path(workspace_root)
    if root.is_symlink():
        raise DryRunRenderSchedulerError(f"Refusing render scheduler workspace symlink: {root}")
    return root


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    try:
        if path.is_symlink():
            raise DryRunRenderSchedulerError(f"Refusing symlinked {label}: {path}")
    except OSError as exc:
        raise DryRunRenderSchedulerError(f"Unable to inspect {label}: {path}") from exc

    current = path.parent
    while current != root and current != current.parent:
        try:
            if current.exists() and current.is_symlink():
                raise DryRunRenderSchedulerError(f"Refusing symlinked parent for {label}: {current}")
        except OSError as exc:
            raise DryRunRenderSchedulerError(f"Unable to inspect parent for {label}: {current}") from exc
        current = current.parent


def _write_report_text(manifest_path: Path, *, root: Path, content: str) -> None:
    legacy_temp_path = manifest_path.with_suffix(".json.tmp")
    _reject_symlink_path(legacy_temp_path, root, "temporary render scheduler report")
    if legacy_temp_path.exists():
        raise DryRunRenderSchedulerError(f"Refusing stale temporary render scheduler report: {legacy_temp_path}")

    temp_path = manifest_path.with_name(
        f".{manifest_path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    )
    _write_text_no_follow(temp_path, content)
    try:
        _reject_symlink_path(temp_path, root, "temporary render scheduler report")
        temp_path.replace(manifest_path)
    except OSError as exc:
        raise DryRunRenderSchedulerError(f"Unable to write render scheduler report: {manifest_path}") from exc
    finally:
        try:
            temp_path.unlink()
        except FileNotFoundError:
            pass


def _write_text_no_follow(path: Path, content: str) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags, 0o600)
    except OSError as exc:
        raise DryRunRenderSchedulerError(f"Unable to create temporary render scheduler report: {path}") from exc
    with os.fdopen(fd, "w", encoding="utf-8") as temp_file:
        temp_file.write(content)


def _read_json_object(path: Path) -> dict[str, object]:
    try:
        raw_text = _read_text_no_follow(path)
    except OSError as exc:
        raise DryRunRenderSchedulerError(f"Unable to read render scheduler report: {path}") from exc
    try:
        raw_json = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise DryRunRenderSchedulerError(f"Invalid render scheduler report JSON: {path}") from exc
    if not isinstance(raw_json, dict):
        raise DryRunRenderSchedulerError("Render scheduler report must be a JSON object")
    return raw_json


def _read_text_no_follow(path: Path) -> str:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    try:
        with os.fdopen(fd, "r", encoding="utf-8") as report_file:
            return report_file.read()
    except Exception:
        os.close(fd)
        raise


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
