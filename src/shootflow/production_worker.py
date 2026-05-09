from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from shootflow.production import ProductionJob, ProductionPlan
from shootflow.production_status import (
    OutputChecksum,
    ProductionJobStatus,
    ProductionStatusError,
    ProductionStatusManifest,
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


def plan_production_worker_actions(
    trusted_plan: ProductionPlan,
    status_manifest: ProductionStatusManifest,
    *,
    worker_adapter: str,
) -> ProductionWorkerActionPlan:
    _validate_worker_adapter(worker_adapter)
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
