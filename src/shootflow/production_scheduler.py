from __future__ import annotations

import json
import os
import re
import uuid
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from types import MappingProxyType

from shootflow.production import ProductionPlan
from shootflow.production_adapter import (
    DryRunProductionBatchResult,
    DryRunProductionError,
    run_production_adapter_batch,
    supported_production_adapter_names,
)
from shootflow.production_status import (
    ProductionStatusError,
    ProductionStatusManifest,
    load_production_status_manifest,
    production_plan_fingerprint,
    validate_production_status_manifest,
)
from shootflow.production_worker import (
    ProductionLeasePersistenceResult,
    ProductionWorkerActionPlan,
    persist_stale_production_leases,
    plan_production_worker_actions,
    plan_stale_production_leases,
)
from shootflow.workflow_authority import (
    WorkflowAuthorityError,
    observe_only_workflow_authority_to_dict,
    validate_observe_only_workflow_authority,
)

_WORKER_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")
PRODUCTION_SCHEDULER_REPORT_PATH = "production_scheduler_report.json"
_REPORT_SCHEMA_VERSION = 3
_SUPPORTED_REPORT_SCHEMA_VERSIONS = frozenset({1, 2, 3})
_REPORT_KEYS = frozenset(
    {
        "schema_version",
        "workflow_authority",
        "generated_at",
        "shoot_slug",
        "production_plan_fingerprint",
        "production_status_fingerprint",
        "worker_adapter",
        "stopped_reason",
        "iteration_count",
        "total_job_count",
        "completed_job_ids",
        "retryable_job_ids",
        "failed_job_ids",
        "blocked_job_ids",
        "attempted_job_ids",
        "skipped_retryable_job_ids",
        "expired_lease_job_ids",
        "conflicted_lease_job_ids",
        "review_required_job_ids",
        "outputs_materialized",
        "failure_messages",
        "product_metrics",
    }
)
_MESSAGE_KEYS = frozenset({"job_id", "message"})
_OPTIONAL_REPORT_KEYS = frozenset({"expired_lease_job_ids", "conflicted_lease_job_ids"})
_PRODUCT_METRIC_NAMES = frozenset(
    {
        "total_job_count",
        "completed_job_count",
        "retryable_job_count",
        "failed_job_count",
        "blocked_job_count",
        "review_required_job_count",
        "attempted_job_count",
        "skipped_retryable_job_count",
        "expired_lease_job_count",
        "conflicted_lease_job_count",
        "materialized_output_count",
        "failure_message_count",
        "iteration_count",
    }
)


class DryRunProductionSchedulerError(ValueError):
    """Raised when dry-run production scheduling cannot proceed safely."""


@dataclass(frozen=True)
class ProductionSchedulerJobMessage:
    job_id: str
    message: str


@dataclass(frozen=True)
class DryRunProductionSchedulerIteration:
    iteration_number: int
    expired_lease_job_ids: tuple[str, ...]
    conflicted_lease_job_ids: tuple[str, ...]
    conflicted_lease_failure_messages: tuple[ProductionSchedulerJobMessage, ...]
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


@dataclass(frozen=True)
class DryRunProductionSchedulerReport:
    workflow_authority: Mapping[str, object]
    generated_at: str
    shoot_slug: str
    production_plan_fingerprint: str
    production_status_fingerprint: str
    worker_adapter: str
    stopped_reason: str
    iteration_count: int
    total_job_count: int
    completed_job_ids: tuple[str, ...]
    retryable_job_ids: tuple[str, ...]
    failed_job_ids: tuple[str, ...]
    blocked_job_ids: tuple[str, ...]
    attempted_job_ids: tuple[str, ...]
    skipped_retryable_job_ids: tuple[str, ...]
    expired_lease_job_ids: tuple[str, ...]
    conflicted_lease_job_ids: tuple[str, ...]
    review_required_job_ids: tuple[str, ...]
    outputs_materialized: tuple[str, ...]
    failure_messages: tuple[ProductionSchedulerJobMessage, ...]
    product_metrics: Mapping[str, int]


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
    stale_before: str | None = None,
    lease_updated_at: str | None = None,
) -> DryRunProductionSchedulerResult:
    """Run dry-run production batches until trusted status has no runnable work."""

    _validate_scheduler_inputs(
        trusted_plan=trusted_plan,
        worker_adapter=worker_adapter,
        started_at=started_at,
        completed_at=completed_at,
        max_concurrency=max_concurrency,
        max_iterations=max_iterations,
        stale_before=stale_before,
        lease_updated_at=lease_updated_at,
    )

    reviewed_retryable_jobs = _reviewed_retryable_tuple(
        reviewed_retryable_job_ids,
        trusted_plan=trusted_plan,
    )
    attempted_job_ids: set[str] = set()
    expired_this_run_job_ids: set[str] = set()
    iterations: list[DryRunProductionSchedulerIteration] = []

    for iteration_number in range(1, max_iterations + 1):
        status_manifest = load_production_status_manifest(workspace_root, trusted_plan=trusted_plan)
        lease_result = _expire_stale_leases(
            workspace_root,
            trusted_plan=trusted_plan,
            status_manifest=status_manifest,
            worker_adapter=worker_adapter,
            stale_before=stale_before,
            lease_updated_at=lease_updated_at,
        )
        if lease_result is not None:
            expired_this_run_job_ids.update(_expired_lease_job_ids(lease_result))
            status_manifest = load_production_status_manifest(workspace_root, trusted_plan=trusted_plan)

        statuses_by_id = {status.job_id: status for status in status_manifest.job_statuses}
        action_plan = plan_production_worker_actions(
            trusted_plan,
            status_manifest,
            worker_adapter=worker_adapter,
            eligible_output_kinds=_eligible_output_kinds_for_adapter(worker_adapter),
        )
        ready_actions = tuple(
            action
            for action in action_plan.actions
            if action.job_id not in attempted_job_ids
            and action.job_id not in expired_this_run_job_ids
            and (
                statuses_by_id[action.job_id].state != "retryable"
                or action.job_id in reviewed_retryable_jobs
            )
        )
        skipped_retryable_job_ids = tuple(
            action.job_id
            for action in action_plan.actions
            if action.job_id in attempted_job_ids
            or action.job_id in expired_this_run_job_ids
            or (
                statuses_by_id[action.job_id].state == "retryable"
                and action.job_id not in reviewed_retryable_jobs
            )
        )
        batch_result = None

        if ready_actions:
            attempted_job_ids.update(action.job_id for action in ready_actions)
            try:
                batch_result = run_production_adapter_batch(
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
            expired_lease_job_ids=_expired_lease_job_ids(lease_result),
            conflicted_lease_job_ids=_conflicted_lease_job_ids(lease_result),
            conflicted_lease_failure_messages=_conflicted_lease_failure_messages(lease_result),
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
        eligible_output_kinds=_eligible_output_kinds_for_adapter(worker_adapter),
    )
    ready_after_cap = tuple(
        action
        for action in final_action_plan.actions
        if action.job_id not in attempted_job_ids
        and action.job_id not in expired_this_run_job_ids
        and (
            final_statuses_by_id[action.job_id].state != "retryable"
            or action.job_id in reviewed_retryable_jobs
        )
    )
    skipped_after_cap = tuple(
        action.job_id
        for action in final_action_plan.actions
        if action.job_id in attempted_job_ids
        or action.job_id in expired_this_run_job_ids
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


def write_dry_run_production_scheduler_report(
    result: DryRunProductionSchedulerResult,
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    final_manifest: ProductionStatusManifest,
    generated_at: str,
) -> Path:
    """Persist a production scheduler summary for UI, retry, and continuation agents."""

    report = _scheduler_report(
        result,
        trusted_plan=trusted_plan,
        final_manifest=final_manifest,
        generated_at=generated_at,
    )
    report_path = _production_scheduler_report_path(workspace_root)
    root = _workspace_root(workspace_root)
    _reject_symlink_path(report_path, root, "production scheduler report")
    _write_report_text(report_path, root=root, content=_report_json(report))
    return report_path


def load_dry_run_production_scheduler_report(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    final_manifest: ProductionStatusManifest,
) -> DryRunProductionSchedulerReport:
    """Load a persisted production scheduler report only if it still matches status."""

    report_path = _production_scheduler_report_path(workspace_root)
    root = _workspace_root(workspace_root)
    _reject_symlink_path(report_path, root, "production scheduler report")
    report = _report_from_json(_read_json_object(report_path))
    _validate_report(report, trusted_plan=trusted_plan, final_manifest=final_manifest)
    return report


def _validate_scheduler_inputs(
    *,
    trusted_plan: ProductionPlan,
    worker_adapter: str,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
    max_iterations: int,
    stale_before: str | None,
    lease_updated_at: str | None,
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
    if stale_before is None and lease_updated_at is not None:
        raise DryRunProductionSchedulerError("lease_updated_at requires stale_before")
    if stale_before is not None:
        _validate_timestamp(stale_before, "stale_before")
        if lease_updated_at is None:
            raise DryRunProductionSchedulerError("lease_updated_at is required when stale_before is provided")
        _validate_timestamp(lease_updated_at, "lease_updated_at")


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


def _eligible_output_kinds_for_adapter(worker_adapter: str) -> tuple[str, ...] | None:
    if worker_adapter == "proxy-production-local":
        return ("proxy_media",)
    return None


def _expire_stale_leases(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    status_manifest: ProductionStatusManifest,
    worker_adapter: str,
    stale_before: str | None,
    lease_updated_at: str | None,
) -> ProductionLeasePersistenceResult | None:
    if stale_before is None:
        return None
    if lease_updated_at is None:
        raise DryRunProductionSchedulerError("lease_updated_at is required when stale_before is provided")
    expiration_plan = plan_stale_production_leases(
        trusted_plan,
        status_manifest,
        stale_before=stale_before,
        updated_at=lease_updated_at,
        eligible_output_kinds=_eligible_output_kinds_for_adapter(worker_adapter),
    )
    if not expiration_plan.expired_leases:
        return None
    return persist_stale_production_leases(
        workspace_root,
        trusted_plan=trusted_plan,
        expiration_plan=expiration_plan,
    )


def _expired_lease_job_ids(result: ProductionLeasePersistenceResult | None) -> tuple[str, ...]:
    if result is None:
        return ()
    return tuple(lease.job_id for lease in result.persisted_leases)


def _conflicted_lease_job_ids(result: ProductionLeasePersistenceResult | None) -> tuple[str, ...]:
    if result is None:
        return ()
    return tuple(lease.job_id for lease in result.conflicted_leases)


def _conflicted_lease_failure_messages(
    result: ProductionLeasePersistenceResult | None,
) -> tuple[ProductionSchedulerJobMessage, ...]:
    if result is None:
        return ()
    return tuple(
        ProductionSchedulerJobMessage(
            job_id=lease.job_id,
            message=lease.error_message,
        )
        for lease in result.conflicted_leases
    )


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


def _scheduler_report(
    result: DryRunProductionSchedulerResult,
    *,
    trusted_plan: ProductionPlan,
    final_manifest: ProductionStatusManifest,
    generated_at: str,
) -> DryRunProductionSchedulerReport:
    _validate_timestamp(generated_at, "generated_at")
    validate_production_status_manifest(final_manifest, trusted_plan=trusted_plan)
    _validate_result(result)
    if result.shoot_slug != trusted_plan.shoot_slug:
        raise DryRunProductionSchedulerError("scheduler result shoot_slug does not match trusted plan")
    attempted_job_ids = _unique_iteration_job_ids(result.iterations, "attempted_job_ids")
    skipped_retryable_job_ids = _unique_iteration_job_ids(
        result.iterations,
        "skipped_retryable_job_ids",
    )
    expired_lease_job_ids = _unique_iteration_job_ids(result.iterations, "expired_lease_job_ids")
    conflicted_lease_job_ids = _unique_iteration_job_ids(
        result.iterations,
        "conflicted_lease_job_ids",
    )
    review_required_job_ids = _review_required_job_ids(result)
    outputs_materialized = _outputs_materialized(result.iterations)
    failure_messages = _failure_messages(result.iterations, final_manifest)
    report = DryRunProductionSchedulerReport(
        workflow_authority=observe_only_workflow_authority_to_dict(),
        generated_at=generated_at,
        shoot_slug=trusted_plan.shoot_slug,
        production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
        production_status_fingerprint=_production_status_fingerprint(final_manifest),
        worker_adapter=result.worker_adapter,
        stopped_reason=result.stopped_reason,
        iteration_count=len(result.iterations),
        total_job_count=len(final_manifest.job_statuses),
        completed_job_ids=result.completed_job_ids,
        retryable_job_ids=result.retryable_job_ids,
        failed_job_ids=result.failed_job_ids,
        blocked_job_ids=result.blocked_job_ids,
        attempted_job_ids=attempted_job_ids,
        skipped_retryable_job_ids=skipped_retryable_job_ids,
        expired_lease_job_ids=expired_lease_job_ids,
        conflicted_lease_job_ids=conflicted_lease_job_ids,
        review_required_job_ids=review_required_job_ids,
        outputs_materialized=outputs_materialized,
        failure_messages=failure_messages,
        product_metrics=_product_metrics(
            iteration_count=len(result.iterations),
            total_job_count=len(final_manifest.job_statuses),
            completed_job_ids=result.completed_job_ids,
            retryable_job_ids=result.retryable_job_ids,
            failed_job_ids=result.failed_job_ids,
            blocked_job_ids=result.blocked_job_ids,
            review_required_job_ids=review_required_job_ids,
            attempted_job_ids=attempted_job_ids,
            skipped_retryable_job_ids=skipped_retryable_job_ids,
            expired_lease_job_ids=expired_lease_job_ids,
            conflicted_lease_job_ids=conflicted_lease_job_ids,
            outputs_materialized=outputs_materialized,
            failure_messages=failure_messages,
        ),
    )
    _validate_report(report, trusted_plan=trusted_plan, final_manifest=final_manifest)
    return report


def _unique_iteration_job_ids(
    iterations: tuple[DryRunProductionSchedulerIteration, ...],
    field_name: str,
) -> tuple[str, ...]:
    seen: set[str] = set()
    ordered: list[str] = []
    for iteration in iterations:
        for job_id in getattr(iteration, field_name):
            if job_id in seen:
                continue
            seen.add(job_id)
            ordered.append(job_id)
    return tuple(ordered)


def _review_required_job_ids(result: DryRunProductionSchedulerResult) -> tuple[str, ...]:
    return _ordered_unique(
        result.retryable_job_ids
        + result.failed_job_ids
        + result.blocked_job_ids
        + _unique_iteration_job_ids(result.iterations, "conflicted_lease_job_ids")
    )


def _outputs_materialized(
    iterations: tuple[DryRunProductionSchedulerIteration, ...],
) -> tuple[str, ...]:
    outputs: list[str] = []
    for iteration in iterations:
        if iteration.batch_result is None:
            continue
        for action_result in iteration.batch_result.results:
            outputs.extend(action_result.outputs_materialized)
    return tuple(outputs)


def _failure_messages(
    iterations: tuple[DryRunProductionSchedulerIteration, ...],
    final_manifest: ProductionStatusManifest,
) -> tuple[ProductionSchedulerJobMessage, ...]:
    messages: list[ProductionSchedulerJobMessage] = []
    for iteration in iterations:
        messages.extend(iteration.conflicted_lease_failure_messages)
        if iteration.batch_result is None:
            continue
        for failure in iteration.batch_result.failures:
            messages.append(
                ProductionSchedulerJobMessage(
                    job_id=failure.job_id,
                    message=failure.error_message,
                )
            )
        for action_result in iteration.batch_result.results:
            final_status = action_result.final_status
            if final_status.state in {"retryable", "failed"} and final_status.error_message is not None:
                messages.append(
                    ProductionSchedulerJobMessage(
                        job_id=final_status.job_id,
                        message=final_status.error_message,
                    )
                )
    messaged_job_ids = {message.job_id for message in messages}
    for status in final_manifest.job_statuses:
        if (
            status.state in {"retryable", "failed"}
            and status.error_message is not None
            and status.job_id not in messaged_job_ids
        ):
            messages.append(
                ProductionSchedulerJobMessage(
                    job_id=status.job_id,
                    message=status.error_message,
                )
            )
    return tuple(messages)


def _report_json(report: DryRunProductionSchedulerReport) -> str:
    _validate_report_shape(report)
    return json.dumps(
        _report_to_json(report),
        ensure_ascii=True,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _report_to_json(report: DryRunProductionSchedulerReport) -> dict[str, object]:
    return {
        "schema_version": _REPORT_SCHEMA_VERSION,
        "workflow_authority": dict(report.workflow_authority),
        "generated_at": report.generated_at,
        "shoot_slug": report.shoot_slug,
        "production_plan_fingerprint": report.production_plan_fingerprint,
        "production_status_fingerprint": report.production_status_fingerprint,
        "worker_adapter": report.worker_adapter,
        "stopped_reason": report.stopped_reason,
        "iteration_count": report.iteration_count,
        "total_job_count": report.total_job_count,
        "completed_job_ids": list(report.completed_job_ids),
        "retryable_job_ids": list(report.retryable_job_ids),
        "failed_job_ids": list(report.failed_job_ids),
        "blocked_job_ids": list(report.blocked_job_ids),
        "attempted_job_ids": list(report.attempted_job_ids),
        "skipped_retryable_job_ids": list(report.skipped_retryable_job_ids),
        "expired_lease_job_ids": list(report.expired_lease_job_ids),
        "conflicted_lease_job_ids": list(report.conflicted_lease_job_ids),
        "review_required_job_ids": list(report.review_required_job_ids),
        "outputs_materialized": list(report.outputs_materialized),
        "failure_messages": [
            {"job_id": message.job_id, "message": message.message}
            for message in report.failure_messages
        ],
        "product_metrics": dict(report.product_metrics),
    }


def _report_from_json(raw_report: dict[str, object]) -> DryRunProductionSchedulerReport:
    unknown_keys = set(raw_report) - _REPORT_KEYS
    raw_schema_version = raw_report.get("schema_version")
    if raw_schema_version not in _SUPPORTED_REPORT_SCHEMA_VERSIONS:
        raise DryRunProductionSchedulerError("Production scheduler report schema_version is unsupported")
    required_keys = _REPORT_KEYS - _OPTIONAL_REPORT_KEYS
    if raw_schema_version == 1:
        required_keys = required_keys - {"product_metrics", "workflow_authority"}
    elif raw_schema_version == 2:
        required_keys = required_keys - {"workflow_authority"}
    missing_keys = required_keys - set(raw_report)
    if unknown_keys:
        raise DryRunProductionSchedulerError(
            f"Production scheduler report contains unknown fields: {sorted(unknown_keys)}"
        )
    if missing_keys:
        raise DryRunProductionSchedulerError(
            f"Production scheduler report is missing fields: {sorted(missing_keys)}"
        )
    iteration_count = _json_non_negative_int(raw_report["iteration_count"], "iteration_count")
    total_job_count = _json_non_negative_int(raw_report["total_job_count"], "total_job_count")
    completed_job_ids = _json_string_tuple(raw_report["completed_job_ids"], "completed_job_ids")
    retryable_job_ids = _json_string_tuple(raw_report["retryable_job_ids"], "retryable_job_ids")
    failed_job_ids = _json_string_tuple(raw_report["failed_job_ids"], "failed_job_ids")
    blocked_job_ids = _json_string_tuple(raw_report["blocked_job_ids"], "blocked_job_ids")
    attempted_job_ids = _json_string_tuple(raw_report["attempted_job_ids"], "attempted_job_ids")
    skipped_retryable_job_ids = _json_string_tuple(
        raw_report["skipped_retryable_job_ids"],
        "skipped_retryable_job_ids",
    )
    expired_lease_job_ids = _json_string_tuple(
        raw_report.get("expired_lease_job_ids", []),
        "expired_lease_job_ids",
    )
    conflicted_lease_job_ids = _json_string_tuple(
        raw_report.get("conflicted_lease_job_ids", []),
        "conflicted_lease_job_ids",
    )
    review_required_job_ids = _json_string_tuple(
        raw_report["review_required_job_ids"],
        "review_required_job_ids",
    )
    outputs_materialized = _json_string_tuple(raw_report["outputs_materialized"], "outputs_materialized")
    failure_messages = _json_job_messages(raw_report["failure_messages"])
    product_metrics = (
        _json_product_metrics(raw_report["product_metrics"])
        if "product_metrics" in raw_report
        else _product_metrics(
            iteration_count=iteration_count,
            total_job_count=total_job_count,
            completed_job_ids=completed_job_ids,
            retryable_job_ids=retryable_job_ids,
            failed_job_ids=failed_job_ids,
            blocked_job_ids=blocked_job_ids,
            review_required_job_ids=review_required_job_ids,
            attempted_job_ids=attempted_job_ids,
            skipped_retryable_job_ids=skipped_retryable_job_ids,
            expired_lease_job_ids=expired_lease_job_ids,
            conflicted_lease_job_ids=conflicted_lease_job_ids,
            outputs_materialized=outputs_materialized,
            failure_messages=failure_messages,
        )
    )
    workflow_authority = _report_workflow_authority(raw_report)
    return DryRunProductionSchedulerReport(
        workflow_authority=workflow_authority,
        generated_at=_json_string(raw_report["generated_at"], "generated_at"),
        shoot_slug=_json_string(raw_report["shoot_slug"], "shoot_slug"),
        production_plan_fingerprint=_json_string(
            raw_report["production_plan_fingerprint"],
            "production_plan_fingerprint",
        ),
        production_status_fingerprint=_json_string(
            raw_report["production_status_fingerprint"],
            "production_status_fingerprint",
        ),
        worker_adapter=_json_string(raw_report["worker_adapter"], "worker_adapter"),
        stopped_reason=_json_string(raw_report["stopped_reason"], "stopped_reason"),
        iteration_count=iteration_count,
        total_job_count=total_job_count,
        completed_job_ids=completed_job_ids,
        retryable_job_ids=retryable_job_ids,
        failed_job_ids=failed_job_ids,
        blocked_job_ids=blocked_job_ids,
        attempted_job_ids=attempted_job_ids,
        skipped_retryable_job_ids=skipped_retryable_job_ids,
        expired_lease_job_ids=expired_lease_job_ids,
        conflicted_lease_job_ids=conflicted_lease_job_ids,
        review_required_job_ids=review_required_job_ids,
        outputs_materialized=outputs_materialized,
        failure_messages=failure_messages,
        product_metrics=product_metrics,
    )


def _json_job_messages(raw_messages: object) -> tuple[ProductionSchedulerJobMessage, ...]:
    if not isinstance(raw_messages, list):
        raise DryRunProductionSchedulerError("failure_messages must be a list")
    messages: list[ProductionSchedulerJobMessage] = []
    for raw_message in raw_messages:
        if not isinstance(raw_message, dict):
            raise DryRunProductionSchedulerError("failure_messages must contain objects")
        unknown_keys = set(raw_message) - _MESSAGE_KEYS
        missing_keys = _MESSAGE_KEYS - set(raw_message)
        if unknown_keys:
            raise DryRunProductionSchedulerError(
                f"failure_messages contains unknown fields: {sorted(unknown_keys)}"
            )
        if missing_keys:
            raise DryRunProductionSchedulerError(
                f"failure_messages is missing fields: {sorted(missing_keys)}"
            )
        messages.append(
            ProductionSchedulerJobMessage(
                job_id=_json_string(raw_message["job_id"], "failure_messages.job_id"),
                message=_json_string(raw_message["message"], "failure_messages.message"),
            )
        )
    return tuple(messages)


def _json_string(value: object, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise DryRunProductionSchedulerError(f"{field_name} must be a non-empty string")
    return value


def _json_non_negative_int(value: object, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise DryRunProductionSchedulerError(f"{field_name} must be a non-negative integer")
    return value


def _json_string_tuple(value: object, field_name: str) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise DryRunProductionSchedulerError(f"{field_name} must be a list")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise DryRunProductionSchedulerError(f"{field_name} must contain non-empty strings")
        result.append(item)
    return tuple(result)


def _json_product_metrics(raw_metrics: object) -> Mapping[str, int]:
    if not isinstance(raw_metrics, dict):
        raise DryRunProductionSchedulerError("product_metrics must be an object")
    unknown_keys = set(raw_metrics) - _PRODUCT_METRIC_NAMES
    missing_keys = _PRODUCT_METRIC_NAMES - set(raw_metrics)
    if unknown_keys:
        raise DryRunProductionSchedulerError(
            f"product_metrics contains unknown metrics: {sorted(unknown_keys)}"
        )
    if missing_keys:
        raise DryRunProductionSchedulerError(
            f"product_metrics is missing metrics: {sorted(missing_keys)}"
        )
    metrics: dict[str, int] = {}
    for name in sorted(_PRODUCT_METRIC_NAMES):
        value = raw_metrics[name]
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise DryRunProductionSchedulerError(f"product_metrics {name} must be a non-negative integer")
        metrics[name] = value
    return _freeze_product_metrics(metrics)


def _validate_report(
    report: DryRunProductionSchedulerReport,
    *,
    trusted_plan: ProductionPlan,
    final_manifest: ProductionStatusManifest,
) -> None:
    try:
        validate_production_status_manifest(final_manifest, trusted_plan=trusted_plan)
    except ProductionStatusError as exc:
        raise DryRunProductionSchedulerError(
            f"Production scheduler report final status is invalid: {exc}"
        ) from exc
    _validate_report_shape(report)
    expected_fingerprint = production_plan_fingerprint(trusted_plan)
    if report.shoot_slug != trusted_plan.shoot_slug:
        raise DryRunProductionSchedulerError("Production scheduler report shoot_slug does not match trusted plan")
    if report.production_plan_fingerprint != expected_fingerprint:
        raise DryRunProductionSchedulerError(
            "Production scheduler report fingerprint does not match trusted plan"
        )
    expected_status_fingerprint = _production_status_fingerprint(final_manifest)
    if report.production_status_fingerprint != expected_status_fingerprint:
        raise DryRunProductionSchedulerError(
            "Production scheduler report status fingerprint does not match final status"
        )
    if report.total_job_count != len(final_manifest.job_statuses):
        raise DryRunProductionSchedulerError("Production scheduler report job count does not match final status")
    if report.iteration_count < 1:
        raise DryRunProductionSchedulerError("Production scheduler report must include at least one iteration")
    manifest_statuses = {status.job_id: status for status in final_manifest.job_statuses}
    if set(report.completed_job_ids) != _manifest_job_ids_with_state(final_manifest, "succeeded"):
        raise DryRunProductionSchedulerError(
            "Production scheduler report completed jobs do not match final status"
        )
    if set(report.retryable_job_ids) != _manifest_job_ids_with_state(final_manifest, "retryable"):
        raise DryRunProductionSchedulerError(
            "Production scheduler report retryable jobs do not match final status"
        )
    if set(report.failed_job_ids) != _manifest_job_ids_with_state(final_manifest, "failed"):
        raise DryRunProductionSchedulerError("Production scheduler report failed jobs do not match final status")
    known_job_ids = set(manifest_statuses)
    for field_name in (
        "completed_job_ids",
        "retryable_job_ids",
        "failed_job_ids",
        "blocked_job_ids",
        "attempted_job_ids",
        "skipped_retryable_job_ids",
        "expired_lease_job_ids",
        "conflicted_lease_job_ids",
        "review_required_job_ids",
    ):
        job_ids = getattr(report, field_name)
        unknown = set(job_ids) - known_job_ids
        if unknown:
            raise DryRunProductionSchedulerError(
                f"Production scheduler report {field_name} contains unknown jobs: {sorted(unknown)}"
            )
    _validate_report_blocked_jobs(report, manifest_statuses)
    _validate_report_stopped_reason(report, final_manifest)
    expected_review_required = _ordered_unique(
        report.retryable_job_ids
        + report.failed_job_ids
        + report.blocked_job_ids
        + report.conflicted_lease_job_ids
    )
    if report.review_required_job_ids != expected_review_required:
        raise DryRunProductionSchedulerError(
            "Production scheduler report review_required_job_ids are inconsistent"
        )
    expected_output_paths = {
        output.path
        for status in final_manifest.job_statuses
        if status.state == "succeeded"
        for output in status.output_checksums
    }
    for output_path in report.outputs_materialized:
        if output_path not in expected_output_paths:
            raise DryRunProductionSchedulerError(
                "Production scheduler report outputs_materialized contains unknown outputs"
            )
    message_job_ids = {message.job_id for message in report.failure_messages}
    if message_job_ids - known_job_ids:
        raise DryRunProductionSchedulerError("Production scheduler report failure_messages contain unknown jobs")
    for message in report.failure_messages:
        if manifest_statuses[message.job_id].state == "succeeded":
            raise DryRunProductionSchedulerError(
                "Production scheduler report failure_messages cannot describe succeeded jobs"
            )
    if report.product_metrics != _product_metrics_from_report(report):
        raise DryRunProductionSchedulerError("Production scheduler report product_metrics are inconsistent")


def _validate_report_blocked_jobs(
    report: DryRunProductionSchedulerReport,
    manifest_statuses: dict[str, object],
) -> None:
    for job_id in report.blocked_job_ids:
        status = manifest_statuses[job_id]
        if getattr(status, "state") not in {"pending", "retryable"}:
            raise DryRunProductionSchedulerError(
                "Production scheduler report blocked_job_ids conflict with final status"
            )
    for job_id in report.skipped_retryable_job_ids:
        status = manifest_statuses[job_id]
        if getattr(status, "state") != "retryable":
            raise DryRunProductionSchedulerError(
                "Production scheduler report skipped_retryable_job_ids conflict with final status"
            )


def _validate_report_stopped_reason(
    report: DryRunProductionSchedulerReport,
    final_manifest: ProductionStatusManifest,
) -> None:
    states = {status.state for status in final_manifest.job_statuses}
    has_unfinished = bool(states & {"pending", "running", "retryable"})
    if report.stopped_reason == "complete":
        if states not in (set(), {"succeeded"}) or report.review_required_job_ids:
            raise DryRunProductionSchedulerError(
                "Production scheduler report stopped_reason conflicts with final status"
            )
        return
    if report.stopped_reason == "failed":
        if "failed" not in states:
            raise DryRunProductionSchedulerError(
                "Production scheduler report stopped_reason conflicts with final status"
            )
        return
    if report.stopped_reason == "retryable":
        if not report.retryable_job_ids:
            raise DryRunProductionSchedulerError(
                "Production scheduler report stopped_reason conflicts with final status"
            )
        return
    if report.stopped_reason == "blocked":
        if not report.blocked_job_ids:
            raise DryRunProductionSchedulerError(
                "Production scheduler report stopped_reason conflicts with final status"
            )
        return
    if report.stopped_reason == "waiting":
        if "failed" in states or not has_unfinished:
            raise DryRunProductionSchedulerError(
                "Production scheduler report stopped_reason conflicts with final status"
            )
        return
    if report.stopped_reason == "max_iterations" and not has_unfinished and "failed" not in states:
        raise DryRunProductionSchedulerError(
            "Production scheduler report stopped_reason conflicts with final status"
        )


def _manifest_job_ids_with_state(manifest: ProductionStatusManifest, state: str) -> set[str]:
    return {status.job_id for status in manifest.job_statuses if status.state == state}


def _production_status_fingerprint(manifest: ProductionStatusManifest) -> str:
    raw_fingerprint_input = {
        "shoot_slug": manifest.shoot_slug,
        "production_plan_fingerprint": manifest.production_plan_fingerprint,
        "job_statuses": [
            {
                "job_id": status.job_id,
                "state": status.state,
                "worker_adapter": status.worker_adapter,
                "attempts": status.attempts,
                "error_message": status.error_message,
                "output_checksums": [
                    {"path": output.path, "sha256": output.sha256}
                    for output in status.output_checksums
                ],
                "updated_at": status.updated_at,
            }
            for status in manifest.job_statuses
        ],
    }
    encoded = json.dumps(
        raw_fingerprint_input,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return sha256(encoded).hexdigest()


def _ordered_unique(job_ids: tuple[str, ...]) -> tuple[str, ...]:
    seen: set[str] = set()
    ordered: list[str] = []
    for job_id in job_ids:
        if job_id in seen:
            continue
        seen.add(job_id)
        ordered.append(job_id)
    return tuple(ordered)


def _validate_report_shape(report: DryRunProductionSchedulerReport) -> None:
    if not isinstance(report, DryRunProductionSchedulerReport):
        raise DryRunProductionSchedulerError("report must be a DryRunProductionSchedulerReport")
    _validate_report_workflow_authority(report.workflow_authority)
    _validate_timestamp(report.generated_at, "generated_at")
    if not isinstance(report.shoot_slug, str) or not report.shoot_slug.strip():
        raise DryRunProductionSchedulerError("report shoot_slug cannot be empty")
    if (
        not isinstance(report.production_plan_fingerprint, str)
        or not report.production_plan_fingerprint.strip()
    ):
        raise DryRunProductionSchedulerError("report production_plan_fingerprint cannot be empty")
    if (
        not isinstance(report.production_status_fingerprint, str)
        or not report.production_status_fingerprint.strip()
    ):
        raise DryRunProductionSchedulerError("report production_status_fingerprint cannot be empty")
    if not isinstance(report.worker_adapter, str) or not _WORKER_PATTERN.fullmatch(report.worker_adapter):
        raise DryRunProductionSchedulerError("report worker_adapter is invalid")
    if report.stopped_reason not in {"complete", "blocked", "retryable", "failed", "waiting", "max_iterations"}:
        raise DryRunProductionSchedulerError("report stopped_reason is invalid")
    for field_name in ("iteration_count", "total_job_count"):
        value = getattr(report, field_name)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise DryRunProductionSchedulerError(f"report {field_name} must be a non-negative integer")
    for field_name in (
        "completed_job_ids",
        "retryable_job_ids",
        "failed_job_ids",
        "blocked_job_ids",
        "attempted_job_ids",
        "skipped_retryable_job_ids",
        "expired_lease_job_ids",
        "conflicted_lease_job_ids",
        "review_required_job_ids",
        "outputs_materialized",
    ):
        value = getattr(report, field_name)
        if not isinstance(value, tuple):
            raise DryRunProductionSchedulerError(f"report {field_name} must be a tuple")
        for item in value:
            if not isinstance(item, str) or not item.strip():
                raise DryRunProductionSchedulerError(f"report {field_name} contains an invalid string")
        _reject_duplicate_strings(value, f"report {field_name}")
    if not isinstance(report.failure_messages, tuple):
        raise DryRunProductionSchedulerError("report failure_messages must be a tuple")
    seen_failure_message_job_ids: set[str] = set()
    for message in report.failure_messages:
        if not isinstance(message, ProductionSchedulerJobMessage):
            raise DryRunProductionSchedulerError("report failure_messages contains invalid message")
        if not isinstance(message.job_id, str) or not message.job_id.strip():
            raise DryRunProductionSchedulerError("report failure_messages contains invalid job id")
        if not isinstance(message.message, str) or not message.message.strip():
            raise DryRunProductionSchedulerError("report failure_messages contains invalid message")
        if message.job_id in seen_failure_message_job_ids:
            raise DryRunProductionSchedulerError("report failure_messages contains duplicate messages")
        seen_failure_message_job_ids.add(message.job_id)
    _validate_product_metrics(report.product_metrics)


def _report_workflow_authority(raw_report: Mapping[str, object]) -> dict[str, object]:
    if "workflow_authority" not in raw_report:
        return observe_only_workflow_authority_to_dict()
    authority = raw_report["workflow_authority"]
    _validate_report_workflow_authority(authority)
    return dict(authority)


def _validate_report_workflow_authority(authority: object) -> None:
    try:
        validate_observe_only_workflow_authority(
            authority,
            field_label="Production scheduler report workflow_authority",
        )
    except WorkflowAuthorityError as exc:
        raise DryRunProductionSchedulerError(str(exc)) from exc


def _validate_product_metrics(metrics: Mapping[str, int]) -> None:
    if not isinstance(metrics, Mapping):
        raise DryRunProductionSchedulerError("report product_metrics must be a mapping")
    unknown_keys = set(metrics) - _PRODUCT_METRIC_NAMES
    missing_keys = _PRODUCT_METRIC_NAMES - set(metrics)
    if unknown_keys:
        raise DryRunProductionSchedulerError(
            f"report product_metrics contains unknown metrics: {sorted(unknown_keys)}"
        )
    if missing_keys:
        raise DryRunProductionSchedulerError(
            f"report product_metrics is missing metrics: {sorted(missing_keys)}"
        )
    for name, value in metrics.items():
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise DryRunProductionSchedulerError(
                f"report product_metrics {name} must be a non-negative integer"
            )


def _product_metrics_from_report(report: DryRunProductionSchedulerReport) -> Mapping[str, int]:
    return _product_metrics(
        iteration_count=report.iteration_count,
        total_job_count=report.total_job_count,
        completed_job_ids=report.completed_job_ids,
        retryable_job_ids=report.retryable_job_ids,
        failed_job_ids=report.failed_job_ids,
        blocked_job_ids=report.blocked_job_ids,
        review_required_job_ids=report.review_required_job_ids,
        attempted_job_ids=report.attempted_job_ids,
        skipped_retryable_job_ids=report.skipped_retryable_job_ids,
        expired_lease_job_ids=report.expired_lease_job_ids,
        conflicted_lease_job_ids=report.conflicted_lease_job_ids,
        outputs_materialized=report.outputs_materialized,
        failure_messages=report.failure_messages,
    )


def _product_metrics(
    *,
    iteration_count: int,
    total_job_count: int,
    completed_job_ids: tuple[str, ...],
    retryable_job_ids: tuple[str, ...],
    failed_job_ids: tuple[str, ...],
    blocked_job_ids: tuple[str, ...],
    review_required_job_ids: tuple[str, ...],
    attempted_job_ids: tuple[str, ...],
    skipped_retryable_job_ids: tuple[str, ...],
    expired_lease_job_ids: tuple[str, ...],
    conflicted_lease_job_ids: tuple[str, ...],
    outputs_materialized: tuple[str, ...],
    failure_messages: tuple[ProductionSchedulerJobMessage, ...],
) -> Mapping[str, int]:
    return _freeze_product_metrics({
        "attempted_job_count": len(attempted_job_ids),
        "blocked_job_count": len(blocked_job_ids),
        "completed_job_count": len(completed_job_ids),
        "conflicted_lease_job_count": len(conflicted_lease_job_ids),
        "expired_lease_job_count": len(expired_lease_job_ids),
        "failed_job_count": len(failed_job_ids),
        "failure_message_count": len(failure_messages),
        "iteration_count": iteration_count,
        "materialized_output_count": len(outputs_materialized),
        "retryable_job_count": len(retryable_job_ids),
        "review_required_job_count": len(review_required_job_ids),
        "skipped_retryable_job_count": len(skipped_retryable_job_ids),
        "total_job_count": total_job_count,
    })


def _freeze_product_metrics(metrics: dict[str, int]) -> Mapping[str, int]:
    return MappingProxyType(dict(metrics))


def _reject_duplicate_strings(values: tuple[str, ...], field_name: str) -> None:
    seen: set[str] = set()
    for value in values:
        if value in seen:
            raise DryRunProductionSchedulerError(f"{field_name} contains duplicate value: {value}")
        seen.add(value)


def _production_scheduler_report_path(workspace_root: Path | str) -> Path:
    return _workspace_root(workspace_root) / PRODUCTION_SCHEDULER_REPORT_PATH


def _workspace_root(workspace_root: Path | str) -> Path:
    if not isinstance(workspace_root, (Path, str)):
        raise DryRunProductionSchedulerError("workspace_root must be a pathlib.Path or string")
    root = Path(workspace_root)
    if root.is_symlink():
        raise DryRunProductionSchedulerError(f"Refusing production scheduler workspace symlink: {root}")
    return root


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    try:
        if path.is_symlink():
            raise DryRunProductionSchedulerError(f"Refusing symlinked {label}: {path}")
    except OSError as exc:
        raise DryRunProductionSchedulerError(f"Unable to inspect {label}: {path}") from exc

    current = path.parent
    while current != root and current != current.parent:
        try:
            if current.exists() and current.is_symlink():
                raise DryRunProductionSchedulerError(f"Refusing symlinked parent for {label}: {current}")
        except OSError as exc:
            raise DryRunProductionSchedulerError(f"Unable to inspect parent for {label}: {current}") from exc
        current = current.parent


def _write_report_text(report_path: Path, *, root: Path, content: str) -> None:
    legacy_temp_path = report_path.with_suffix(".json.tmp")
    _reject_symlink_path(legacy_temp_path, root, "temporary production scheduler report")
    if legacy_temp_path.exists():
        raise DryRunProductionSchedulerError(
            f"Refusing stale temporary production scheduler report: {legacy_temp_path}"
        )

    temp_path = report_path.with_name(
        f".{report_path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    )
    _write_text_no_follow(temp_path, content)
    try:
        _reject_symlink_path(temp_path, root, "temporary production scheduler report")
        temp_path.replace(report_path)
    except OSError as exc:
        raise DryRunProductionSchedulerError(
            f"Unable to write production scheduler report: {report_path}"
        ) from exc
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
        raise DryRunProductionSchedulerError(
            f"Unable to create temporary production scheduler report: {path}"
        ) from exc
    with os.fdopen(fd, "w", encoding="utf-8") as temp_file:
        temp_file.write(content)


def _read_json_object(path: Path) -> dict[str, object]:
    try:
        raw_text = _read_text_no_follow(path)
    except OSError as exc:
        raise DryRunProductionSchedulerError(f"Unable to read production scheduler report: {path}") from exc
    try:
        raw_json = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise DryRunProductionSchedulerError(f"Invalid production scheduler report JSON: {path}") from exc
    if not isinstance(raw_json, dict):
        raise DryRunProductionSchedulerError("Production scheduler report must be a JSON object")
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
        "expired_lease_job_ids",
        "conflicted_lease_job_ids",
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
    if not isinstance(iteration.conflicted_lease_failure_messages, tuple):
        raise DryRunProductionSchedulerError("conflicted_lease_failure_messages must be a tuple")
    for message in iteration.conflicted_lease_failure_messages:
        _validate_job_message(message)
    if iteration.batch_result is not None and not isinstance(iteration.batch_result, DryRunProductionBatchResult):
        raise DryRunProductionSchedulerError("batch_result is invalid")


def _validate_job_message(message: ProductionSchedulerJobMessage) -> None:
    if not isinstance(message, ProductionSchedulerJobMessage):
        raise DryRunProductionSchedulerError("job message is invalid")
    if not isinstance(message.job_id, str) or not message.job_id.strip():
        raise DryRunProductionSchedulerError("job message job_id is invalid")
    if not isinstance(message.message, str) or not message.message.strip():
        raise DryRunProductionSchedulerError("job message text is invalid")


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
