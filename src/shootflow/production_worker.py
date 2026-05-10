from __future__ import annotations

from collections.abc import Iterable
import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from shootflow.production import ProductionJob, ProductionPlan
from shootflow.production_status import (
    OutputChecksum,
    ProductionJobStatus,
    ProductionStatusError,
    ProductionStatusManifest,
    ProductionStatusPreconditionError,
    compare_and_write_production_job_status,
    validate_production_status_manifest,
)

_WORKER_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")
_RUNNABLE_STATES = frozenset({"pending", "retryable"})


class ProductionWorkerError(ValueError):
    """Raised when production-worker actions cannot be planned safely."""


@dataclass(frozen=True)
class ProductionWorkerAction:
    job_id: str
    worker_adapter: str
    attempt_number: int
    output_kind: str
    inputs: tuple[str, ...]
    outputs: tuple[str, ...]
    depends_on: tuple[str, ...]
    can_run_in_parallel: bool


@dataclass(frozen=True)
class BlockedProductionJob:
    job_id: str
    missing_dependencies: tuple[str, ...]


@dataclass(frozen=True)
class ProductionWorkerActionPlan:
    shoot_slug: str
    worker_adapter: str
    actions: tuple[ProductionWorkerAction, ...]
    blocked_jobs: tuple[BlockedProductionJob, ...]


@dataclass(frozen=True)
class ExpiredProductionLease:
    job_id: str
    worker_adapter: str
    attempt_number: int
    running_since: str
    retryable_status: ProductionJobStatus


@dataclass(frozen=True)
class ProductionLeaseExpirationPlan:
    shoot_slug: str
    stale_before: str
    updated_at: str
    expired_leases: tuple[ExpiredProductionLease, ...]


@dataclass(frozen=True)
class PersistedProductionLease:
    job_id: str
    retryable_status: ProductionJobStatus
    manifest: ProductionStatusManifest


@dataclass(frozen=True)
class ConflictedProductionLease:
    job_id: str
    error_message: str


@dataclass(frozen=True)
class ProductionLeasePersistenceResult:
    shoot_slug: str
    persisted_leases: tuple[PersistedProductionLease, ...]
    conflicted_leases: tuple[ConflictedProductionLease, ...]


def plan_production_worker_actions(
    trusted_plan: ProductionPlan,
    status_manifest: ProductionStatusManifest,
    *,
    worker_adapter: str,
    eligible_output_kinds: Iterable[str] | None = None,
) -> ProductionWorkerActionPlan:
    _validate_worker_adapter(worker_adapter)
    eligible_output_kind_set = _eligible_output_kind_set(eligible_output_kinds)
    try:
        validate_production_status_manifest(status_manifest, trusted_plan=trusted_plan)
    except (ProductionStatusError, TypeError) as exc:
        raise ProductionWorkerError("Cannot plan production worker actions from an untrusted status manifest") from exc

    statuses_by_id = _statuses_by_id(status_manifest)
    succeeded_jobs = frozenset(
        status.job_id for status in status_manifest.job_statuses if status.state == "succeeded"
    )

    actions: list[ProductionWorkerAction] = []
    blocked_jobs: list[BlockedProductionJob] = []
    for job in trusted_plan.jobs:
        if eligible_output_kind_set is not None and job.output_kind not in eligible_output_kind_set:
            continue
        status = statuses_by_id[job.job_id]
        if status.state not in _RUNNABLE_STATES:
            continue
        missing_dependencies = _missing_dependencies(job, succeeded_jobs=succeeded_jobs)
        if missing_dependencies:
            blocked_jobs.append(
                BlockedProductionJob(
                    job_id=job.job_id,
                    missing_dependencies=missing_dependencies,
                )
            )
            continue
        actions.append(
            _action_for_job(
                job,
                status=status,
                worker_adapter=worker_adapter,
            )
        )

    action_plan = ProductionWorkerActionPlan(
        shoot_slug=trusted_plan.shoot_slug,
        worker_adapter=worker_adapter,
        actions=tuple(actions),
        blocked_jobs=tuple(blocked_jobs),
    )
    _validate_action_plan(action_plan)
    return action_plan


def plan_stale_production_leases(
    trusted_plan: ProductionPlan,
    status_manifest: ProductionStatusManifest,
    *,
    stale_before: str,
    updated_at: str,
) -> ProductionLeaseExpirationPlan:
    stale_before_time = _parse_lease_timestamp(stale_before, "stale_before")
    updated_at_time = _parse_lease_timestamp(updated_at, "updated_at")
    if updated_at_time < stale_before_time:
        raise ProductionWorkerError("lease expiration updated_at timestamp cannot be before stale_before")
    try:
        validate_production_status_manifest(status_manifest, trusted_plan=trusted_plan)
    except (ProductionStatusError, TypeError) as exc:
        raise ProductionWorkerError("Cannot plan stale production leases from an untrusted status manifest") from exc

    expired_leases: list[ExpiredProductionLease] = []
    for status in status_manifest.job_statuses:
        if status.state != "running":
            continue
        if status.updated_at is None or status.worker_adapter is None:
            raise ProductionWorkerError("running production status is missing lease metadata")
        running_since_time = _parse_lease_timestamp(status.updated_at, "running status updated_at")
        if running_since_time >= stale_before_time:
            continue
        retryable_status = ProductionJobStatus(
            job_id=status.job_id,
            state="retryable",
            worker_adapter=status.worker_adapter,
            attempts=status.attempts,
            error_message=_lease_expiration_error_message(status.updated_at),
            updated_at=updated_at,
        )
        _validate_return_status(retryable_status, expected_state="retryable")
        expired_leases.append(
            ExpiredProductionLease(
                job_id=status.job_id,
                worker_adapter=status.worker_adapter,
                attempt_number=status.attempts,
                running_since=status.updated_at,
                retryable_status=retryable_status,
            )
        )

    expiration_plan = ProductionLeaseExpirationPlan(
        shoot_slug=status_manifest.shoot_slug,
        stale_before=stale_before,
        updated_at=updated_at,
        expired_leases=tuple(expired_leases),
    )
    _validate_lease_expiration_plan(expiration_plan)
    return expiration_plan


def persist_stale_production_leases(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    expiration_plan: ProductionLeaseExpirationPlan,
) -> ProductionLeasePersistenceResult:
    """Persist planned stale production leases without clobbering refreshed workers."""

    _validate_lease_expiration_plan_for_trusted_plan(expiration_plan, trusted_plan=trusted_plan)
    persisted_leases: list[PersistedProductionLease] = []
    conflicted_leases: list[ConflictedProductionLease] = []
    for expired_lease in expiration_plan.expired_leases:
        try:
            updated_manifest = compare_and_write_production_job_status(
                workspace_root,
                trusted_plan=trusted_plan,
                updated_status=expired_lease.retryable_status,
                expected_state="running",
                expected_attempts=expired_lease.attempt_number,
                expected_updated_at=expired_lease.running_since,
            )
        except ProductionStatusPreconditionError as exc:
            conflicted_leases.append(
                ConflictedProductionLease(
                    job_id=expired_lease.job_id,
                    error_message=_lease_conflict_message(expired_lease, exc),
                )
            )
            continue
        except ProductionStatusError as exc:
            raise ProductionWorkerError("Cannot persist stale production lease from untrusted status state") from exc
        persisted_leases.append(
            PersistedProductionLease(
                job_id=expired_lease.job_id,
                retryable_status=expired_lease.retryable_status,
                manifest=updated_manifest,
            )
        )

    result = ProductionLeasePersistenceResult(
        shoot_slug=expiration_plan.shoot_slug,
        persisted_leases=tuple(persisted_leases),
        conflicted_leases=tuple(conflicted_leases),
    )
    _validate_lease_persistence_result(result)
    return result


def claim_production_worker_action(
    current_status: ProductionJobStatus,
    action: ProductionWorkerAction,
    *,
    updated_at: str,
) -> ProductionJobStatus:
    _validate_action(action)
    _validate_timestamp(updated_at)
    _validate_claimable_current_status(current_status, action=action)

    running_status = ProductionJobStatus(
        job_id=action.job_id,
        state="running",
        worker_adapter=action.worker_adapter,
        attempts=action.attempt_number,
        updated_at=updated_at,
    )
    _validate_return_status(running_status, expected_state="running")
    return running_status


def report_production_worker_success(
    current_status: ProductionJobStatus,
    action: ProductionWorkerAction,
    workspace_root: Path | str,
    *,
    updated_at: str,
) -> ProductionJobStatus:
    _validate_action(action)
    _validate_timestamp(updated_at)
    _validate_running_current_status(current_status, action=action)

    succeeded_status = ProductionJobStatus(
        job_id=action.job_id,
        state="succeeded",
        worker_adapter=action.worker_adapter,
        attempts=action.attempt_number,
        output_checksums=_output_checksums_for_action(action, workspace_root),
        updated_at=updated_at,
    )
    _validate_return_status(succeeded_status, expected_state="succeeded")
    return succeeded_status


def report_production_worker_retryable(
    current_status: ProductionJobStatus,
    action: ProductionWorkerAction,
    *,
    error_message: str,
    updated_at: str,
) -> ProductionJobStatus:
    return _report_worker_error_status(
        current_status,
        action,
        state="retryable",
        error_message=error_message,
        updated_at=updated_at,
    )


def report_production_worker_failure(
    current_status: ProductionJobStatus,
    action: ProductionWorkerAction,
    *,
    error_message: str,
    updated_at: str,
) -> ProductionJobStatus:
    return _report_worker_error_status(
        current_status,
        action,
        state="failed",
        error_message=error_message,
        updated_at=updated_at,
    )


def _validate_worker_adapter(worker_adapter: str) -> None:
    if not isinstance(worker_adapter, str) or not _WORKER_PATTERN.fullmatch(worker_adapter):
        raise ProductionWorkerError("Invalid production worker adapter")


def _eligible_output_kind_set(eligible_output_kinds: Iterable[str] | None) -> frozenset[str] | None:
    if eligible_output_kinds is None:
        return None
    if isinstance(eligible_output_kinds, str):
        raise ProductionWorkerError("eligible_output_kinds must be an iterable of output kinds")
    try:
        iterator = iter(eligible_output_kinds)
    except TypeError as exc:
        raise ProductionWorkerError("eligible_output_kinds must be iterable") from exc
    output_kinds: list[str] = []
    seen: set[str] = set()
    for output_kind in iterator:
        _validate_non_empty_string(output_kind, "eligible output kind")
        if output_kind in seen:
            raise ProductionWorkerError(f"duplicate eligible output kind: {output_kind}")
        seen.add(output_kind)
        output_kinds.append(output_kind)
    return frozenset(output_kinds)


def _statuses_by_id(status_manifest: ProductionStatusManifest) -> dict[str, ProductionJobStatus]:
    return {status.job_id: status for status in status_manifest.job_statuses}


def _missing_dependencies(
    job: ProductionJob,
    *,
    succeeded_jobs: frozenset[str],
) -> tuple[str, ...]:
    return tuple(
        dependency_id
        for dependency_id in job.depends_on
        if dependency_id not in succeeded_jobs
    )


def _action_for_job(
    job: ProductionJob,
    *,
    status: ProductionJobStatus,
    worker_adapter: str,
) -> ProductionWorkerAction:
    return ProductionWorkerAction(
        job_id=job.job_id,
        worker_adapter=worker_adapter,
        attempt_number=status.attempts + 1,
        output_kind=job.output_kind,
        inputs=job.inputs,
        outputs=job.outputs,
        depends_on=job.depends_on,
        can_run_in_parallel=job.can_run_in_parallel,
    )


def _validate_action_plan(action_plan: ProductionWorkerActionPlan) -> None:
    if not isinstance(action_plan, ProductionWorkerActionPlan):
        raise ProductionWorkerError("production worker action plan has an invalid return type")
    _validate_non_empty_string(action_plan.shoot_slug, "action plan shoot_slug")
    _validate_worker_adapter(action_plan.worker_adapter)
    if not isinstance(action_plan.actions, tuple):
        raise ProductionWorkerError("production worker actions must be a tuple")
    if not isinstance(action_plan.blocked_jobs, tuple):
        raise ProductionWorkerError("production worker blocked_jobs must be a tuple")
    for action in action_plan.actions:
        _validate_action(action)
    for blocked_job in action_plan.blocked_jobs:
        _validate_blocked_job(blocked_job)


def _validate_lease_expiration_plan(expiration_plan: ProductionLeaseExpirationPlan) -> None:
    if not isinstance(expiration_plan, ProductionLeaseExpirationPlan):
        raise ProductionWorkerError("production lease expiration plan has an invalid return type")
    _validate_non_empty_string(expiration_plan.shoot_slug, "lease expiration shoot_slug")
    stale_before_time = _parse_lease_timestamp(expiration_plan.stale_before, "stale_before")
    updated_at_time = _parse_lease_timestamp(expiration_plan.updated_at, "updated_at")
    if updated_at_time < stale_before_time:
        raise ProductionWorkerError("lease expiration updated_at timestamp cannot be before stale_before")
    if not isinstance(expiration_plan.expired_leases, tuple):
        raise ProductionWorkerError("expired production leases must be a tuple")
    seen_job_ids: set[str] = set()
    for expired_lease in expiration_plan.expired_leases:
        _validate_expired_lease(expired_lease)
        running_since_time = _parse_lease_timestamp(expired_lease.running_since, "expired lease running_since")
        if running_since_time >= stale_before_time:
            raise ProductionWorkerError("expired production lease running_since must be before stale_before")
        if expired_lease.retryable_status.updated_at != expiration_plan.updated_at:
            raise ProductionWorkerError("expired production lease retryable status updated_at does not match plan")
        expected_error_message = _lease_expiration_error_message(expired_lease.running_since)
        if expired_lease.retryable_status.error_message != expected_error_message:
            raise ProductionWorkerError("expired production lease retryable status error message is not trusted")
        if expired_lease.job_id in seen_job_ids:
            raise ProductionWorkerError(f"duplicate expired production lease job: {expired_lease.job_id}")
        seen_job_ids.add(expired_lease.job_id)


def _validate_lease_expiration_plan_for_trusted_plan(
    expiration_plan: ProductionLeaseExpirationPlan,
    *,
    trusted_plan: ProductionPlan,
) -> None:
    _validate_lease_expiration_plan(expiration_plan)
    if not isinstance(trusted_plan, ProductionPlan):
        raise ProductionWorkerError("trusted_plan must be a ProductionPlan")
    if expiration_plan.shoot_slug != trusted_plan.shoot_slug:
        raise ProductionWorkerError("production lease expiration plan shoot_slug does not match trusted plan")
    job_ids = frozenset(job.job_id for job in trusted_plan.jobs)
    for expired_lease in expiration_plan.expired_leases:
        if expired_lease.job_id not in job_ids:
            raise ProductionWorkerError(f"expired production lease job is not in trusted plan: {expired_lease.job_id}")


def _validate_expired_lease(expired_lease: ExpiredProductionLease) -> None:
    if not isinstance(expired_lease, ExpiredProductionLease):
        raise ProductionWorkerError("expired production lease has an invalid return type")
    _validate_non_empty_string(expired_lease.job_id, "expired lease job_id")
    _validate_worker_adapter(expired_lease.worker_adapter)
    if (
        isinstance(expired_lease.attempt_number, bool)
        or not isinstance(expired_lease.attempt_number, int)
        or expired_lease.attempt_number < 1
    ):
        raise ProductionWorkerError("expired production lease attempt_number must be positive")
    _parse_lease_timestamp(expired_lease.running_since, "expired lease running_since")
    _validate_current_status(expired_lease.retryable_status)
    if expired_lease.retryable_status.job_id != expired_lease.job_id:
        raise ProductionWorkerError("expired production lease status job does not match")
    if expired_lease.retryable_status.state != "retryable":
        raise ProductionWorkerError("expired production lease status must be retryable")
    if expired_lease.retryable_status.worker_adapter != expired_lease.worker_adapter:
        raise ProductionWorkerError("expired production lease worker adapter does not match")
    if expired_lease.retryable_status.attempts != expired_lease.attempt_number:
        raise ProductionWorkerError("expired production lease attempts do not match")
    if expired_lease.retryable_status.error_message is None:
        raise ProductionWorkerError("expired production lease must include an error message")
    if expired_lease.retryable_status.output_checksums:
        raise ProductionWorkerError("expired production lease cannot include output checksums")


def _lease_conflict_message(expired_lease: ExpiredProductionLease, exc: ProductionStatusError) -> str:
    detail = str(exc).strip() or exc.__class__.__name__
    if len(detail) > 1500:
        detail = f"{detail[:1500]}..."
    return (
        f"another worker already changed this job before stale lease expiration could be persisted "
        f"for {expired_lease.job_id}: {detail}; "
        "no source, analysis, graded, render, or deliverable files were deleted or cleaned up."
    )


def _lease_expiration_error_message(running_since: str) -> str:
    return (
        f"Production worker lease expired after running since {running_since}; "
        "no source, analysis, graded, render, or deliverable files were deleted or cleaned up."
    )


def _validate_lease_persistence_result(result: ProductionLeasePersistenceResult) -> None:
    if not isinstance(result, ProductionLeasePersistenceResult):
        raise ProductionWorkerError("production lease persistence result has an invalid return type")
    _validate_non_empty_string(result.shoot_slug, "lease persistence shoot_slug")
    if not isinstance(result.persisted_leases, tuple):
        raise ProductionWorkerError("persisted production leases must be a tuple")
    if not isinstance(result.conflicted_leases, tuple):
        raise ProductionWorkerError("conflicted production leases must be a tuple")
    seen_job_ids: set[str] = set()
    for persisted_lease in result.persisted_leases:
        if not isinstance(persisted_lease, PersistedProductionLease):
            raise ProductionWorkerError("persisted production lease has an invalid return type")
        _validate_non_empty_string(persisted_lease.job_id, "persisted lease job_id")
        _validate_current_status(persisted_lease.retryable_status)
        if persisted_lease.retryable_status.state != "retryable":
            raise ProductionWorkerError("persisted production lease status must be retryable")
        if persisted_lease.retryable_status.job_id != persisted_lease.job_id:
            raise ProductionWorkerError("persisted production lease status job does not match")
        if not isinstance(persisted_lease.manifest, ProductionStatusManifest):
            raise ProductionWorkerError("persisted production lease manifest has an invalid return type")
        seen_job_ids.add(persisted_lease.job_id)
    for conflicted_lease in result.conflicted_leases:
        if not isinstance(conflicted_lease, ConflictedProductionLease):
            raise ProductionWorkerError("conflicted production lease has an invalid return type")
        _validate_non_empty_string(conflicted_lease.job_id, "conflicted lease job_id")
        _validate_error_message(conflicted_lease.error_message)
        if conflicted_lease.job_id in seen_job_ids:
            raise ProductionWorkerError(f"production lease cannot be both persisted and conflicted: {conflicted_lease.job_id}")
        seen_job_ids.add(conflicted_lease.job_id)


def _validate_action(action: ProductionWorkerAction) -> None:
    if not isinstance(action, ProductionWorkerAction):
        raise ProductionWorkerError("production worker action has an invalid return type")
    _validate_non_empty_string(action.job_id, "job_id")
    _validate_worker_adapter(action.worker_adapter)
    if isinstance(action.attempt_number, bool) or not isinstance(action.attempt_number, int) or action.attempt_number < 1:
        raise ProductionWorkerError("production worker action attempt_number must be positive")
    _validate_non_empty_string(action.output_kind, "output_kind")
    _validate_string_tuple(action.inputs, "inputs")
    _validate_string_tuple(action.outputs, "outputs")
    _validate_output_paths(action.outputs)
    _validate_string_tuple(action.depends_on, "depends_on")
    if not isinstance(action.can_run_in_parallel, bool):
        raise ProductionWorkerError("production worker action can_run_in_parallel must be a bool")


def _validate_blocked_job(blocked_job: BlockedProductionJob) -> None:
    if not isinstance(blocked_job, BlockedProductionJob):
        raise ProductionWorkerError("production worker blocked job has an invalid return type")
    _validate_non_empty_string(blocked_job.job_id, "blocked job_id")
    _validate_string_tuple(blocked_job.missing_dependencies, "missing_dependencies")


def _validate_non_empty_string(value: object, label: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ProductionWorkerError(f"production worker {label} must be a non-empty string")


def _validate_string_tuple(value: object, label: str) -> None:
    if not isinstance(value, tuple):
        raise ProductionWorkerError(f"production worker {label} must be a tuple")
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise ProductionWorkerError(f"production worker {label} must contain non-empty strings")


def _validate_output_paths(outputs: tuple[str, ...]) -> None:
    seen_outputs: set[str] = set()
    for output in outputs:
        _validate_production_output_path(output)
        if output in seen_outputs:
            raise ProductionWorkerError(f"production worker outputs contain a duplicate path: {output}")
        seen_outputs.add(output)


def _validate_production_output_path(path: str) -> None:
    artifact_path = Path(path)
    if artifact_path.is_absolute() or ".." in artifact_path.parts:
        raise ProductionWorkerError(f"Unsafe production worker output path: {path}")


def _validate_timestamp(timestamp: str) -> None:
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise ProductionWorkerError("production worker updated_at must be a non-empty string")
    if len(timestamp) > 80 or "\x00" in timestamp or "\n" in timestamp or "\r" in timestamp:
        raise ProductionWorkerError("production worker updated_at is invalid")


def _parse_lease_timestamp(timestamp: str, label: str) -> datetime:
    try:
        _validate_timestamp(timestamp)
    except ProductionWorkerError as exc:
        raise ProductionWorkerError(f"lease expiration {label} timestamp is invalid") from exc
    if "T" not in timestamp:
        raise ProductionWorkerError(f"lease expiration {label} timestamp must be ISO 8601")
    normalized_timestamp = timestamp[:-1] + "+00:00" if timestamp.endswith("Z") else timestamp
    try:
        parsed = datetime.fromisoformat(normalized_timestamp)
    except ValueError as exc:
        raise ProductionWorkerError(f"lease expiration {label} timestamp must be ISO 8601") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ProductionWorkerError(f"lease expiration {label} timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def _validate_error_message(message: str) -> None:
    if not isinstance(message, str) or not message.strip():
        raise ProductionWorkerError("production worker error_message must be a non-empty string")
    if len(message) > 2000 or "\x00" in message:
        raise ProductionWorkerError("production worker error_message is invalid")


def _validate_current_status(status: ProductionJobStatus) -> None:
    if not isinstance(status, ProductionJobStatus):
        raise ProductionWorkerError("current status must be a ProductionJobStatus")
    _validate_non_empty_string(status.job_id, "current status job_id")
    if status.state not in {"pending", "running", "succeeded", "failed", "retryable"}:
        raise ProductionWorkerError("current status has an unsupported state")
    if isinstance(status.attempts, bool) or not isinstance(status.attempts, int) or status.attempts < 0:
        raise ProductionWorkerError("current status attempts must be a non-negative integer")
    if status.worker_adapter is not None:
        _validate_worker_adapter(status.worker_adapter)
    if status.updated_at is not None:
        _validate_timestamp(status.updated_at)
    if status.error_message is not None:
        _validate_error_message(status.error_message)
    if not isinstance(status.output_checksums, tuple):
        raise ProductionWorkerError("current status output_checksums must be a tuple")


def _validate_claimable_current_status(
    current_status: ProductionJobStatus,
    *,
    action: ProductionWorkerAction,
) -> None:
    _validate_current_status(current_status)
    if current_status.job_id != action.job_id:
        raise ProductionWorkerError("current status job does not match production worker action")
    if current_status.state not in _RUNNABLE_STATES:
        raise ProductionWorkerError("current status is not claimable for this production worker action")
    if current_status.attempts + 1 != action.attempt_number:
        raise ProductionWorkerError("current status attempts do not match production worker action")


def _validate_running_current_status(
    current_status: ProductionJobStatus,
    *,
    action: ProductionWorkerAction,
) -> None:
    _validate_current_status(current_status)
    if current_status.job_id != action.job_id:
        raise ProductionWorkerError("current status job does not match production worker action")
    if current_status.state != "running":
        raise ProductionWorkerError("current status must be running before reporting a production result")
    if current_status.worker_adapter != action.worker_adapter:
        raise ProductionWorkerError("current status worker adapter does not match production worker action")
    if current_status.attempts != action.attempt_number:
        raise ProductionWorkerError("current status attempts do not match production worker action")
    if current_status.output_checksums:
        raise ProductionWorkerError("current status cannot include output checksums before success")
    if current_status.error_message is not None:
        raise ProductionWorkerError("current status cannot include an error before reporting a production result")


def _report_worker_error_status(
    current_status: ProductionJobStatus,
    action: ProductionWorkerAction,
    *,
    state: str,
    error_message: str,
    updated_at: str,
) -> ProductionJobStatus:
    _validate_action(action)
    _validate_timestamp(updated_at)
    _validate_error_message(error_message)
    _validate_running_current_status(current_status, action=action)
    if state not in {"failed", "retryable"}:
        raise ProductionWorkerError("production worker error status must be failed or retryable")

    error_status = ProductionJobStatus(
        job_id=action.job_id,
        state=state,  # type: ignore[arg-type]
        worker_adapter=action.worker_adapter,
        attempts=action.attempt_number,
        error_message=error_message,
        updated_at=updated_at,
    )
    _validate_return_status(error_status, expected_state=state)
    return error_status


def _output_checksums_for_action(
    action: ProductionWorkerAction,
    workspace_root: Path | str,
) -> tuple[OutputChecksum, ...]:
    root = Path(workspace_root)
    if root.is_symlink():
        raise ProductionWorkerError(f"Refusing production worker workspace symlink: {root}")
    checksums: list[OutputChecksum] = []
    for output in action.outputs:
        output_path = _workspace_output_path(root, output)
        _reject_symlink_path(output_path, root, "production output")
        if not output_path.exists():
            raise ProductionWorkerError(f"Missing production output: {output}")
        if not output_path.is_file():
            raise ProductionWorkerError(f"Production output is not a file: {output}")
        checksums.append(
            OutputChecksum(
                path=output,
                sha256=_sha256_file(output_path),
            )
        )
    return tuple(checksums)


def _workspace_output_path(root: Path, output: str) -> Path:
    _validate_production_output_path(output)
    output_path = root / output
    try:
        output_path.relative_to(root)
    except ValueError as exc:
        raise ProductionWorkerError(f"Production output escapes workspace: {output}") from exc
    return output_path


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as output_file:
            for chunk in iter(lambda: output_file.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise ProductionWorkerError(f"Unable to checksum production output: {path}") from exc
    return digest.hexdigest()


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    current = path
    while True:
        if current.is_symlink():
            raise ProductionWorkerError(f"Refusing {label} symlink: {current}")
        if current == root or current.absolute() == root.absolute():
            break
        if current.parent == current:
            break
        current = current.parent


def _validate_return_status(status: ProductionJobStatus, *, expected_state: str) -> None:
    _validate_current_status(status)
    if status.state != expected_state:
        raise ProductionWorkerError("production worker returned an unexpected status state")
