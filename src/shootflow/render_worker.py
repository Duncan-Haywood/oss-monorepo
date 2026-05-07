from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from shootflow.assembly import AssemblyPlan, RenderTask
from shootflow.render_status import (
    OutputChecksum,
    RenderStatusError,
    RenderStatusManifest,
    RenderTaskStatus,
    validate_render_status_manifest,
)

_RENDERER_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")
_RUNNABLE_STATES = frozenset({"pending", "retryable"})


class RenderWorkerError(ValueError):
    """Raised when render-worker actions cannot be planned safely."""


@dataclass(frozen=True)
class RenderWorkerAction:
    task_id: str
    renderer_adapter: str
    attempt_number: int
    sequence_name: str
    source_job_id: str
    output_kind: str
    aspect_ratio: str
    inputs: tuple[str, ...]
    outputs: tuple[str, ...]
    depends_on: tuple[str, ...]
    can_run_in_parallel: bool


@dataclass(frozen=True)
class BlockedRenderTask:
    task_id: str
    missing_dependencies: tuple[str, ...]


@dataclass(frozen=True)
class RenderWorkerActionPlan:
    shoot_slug: str
    renderer_adapter: str
    actions: tuple[RenderWorkerAction, ...]
    blocked_tasks: tuple[BlockedRenderTask, ...]


@dataclass(frozen=True)
class ExpiredRenderLease:
    task_id: str
    renderer_adapter: str
    attempt_number: int
    running_since: str
    retryable_status: RenderTaskStatus


@dataclass(frozen=True)
class RenderLeaseExpirationPlan:
    shoot_slug: str
    stale_before: str
    updated_at: str
    expired_leases: tuple[ExpiredRenderLease, ...]


def plan_render_worker_actions(
    trusted_plan: AssemblyPlan,
    status_manifest: RenderStatusManifest,
    *,
    completed_dependency_ids: Iterable[str],
    renderer_adapter: str,
) -> RenderWorkerActionPlan:
    _validate_renderer_adapter(renderer_adapter)
    completed_dependencies = _completed_dependency_set(completed_dependency_ids)
    try:
        validate_render_status_manifest(status_manifest, trusted_plan=trusted_plan)
    except (RenderStatusError, TypeError) as exc:
        raise RenderWorkerError("Cannot plan render worker actions from an untrusted status manifest") from exc

    tasks_by_id = _tasks_by_id(trusted_plan)
    statuses_by_id = _statuses_by_id(status_manifest)
    succeeded_render_tasks = frozenset(
        status.task_id for status in status_manifest.task_statuses if status.state == "succeeded"
    )

    actions: list[RenderWorkerAction] = []
    blocked_tasks: list[BlockedRenderTask] = []
    for task in trusted_plan.render_tasks:
        status = statuses_by_id[task.task_id]
        if status.state not in _RUNNABLE_STATES:
            continue
        missing_dependencies = _missing_dependencies(
            task,
            completed_dependencies=completed_dependencies,
            render_task_ids=frozenset(tasks_by_id),
            succeeded_render_tasks=succeeded_render_tasks,
        )
        if missing_dependencies:
            blocked_tasks.append(
                BlockedRenderTask(
                    task_id=task.task_id,
                    missing_dependencies=missing_dependencies,
                )
            )
            continue
        actions.append(
            _action_for_task(
                task,
                status=status,
                renderer_adapter=renderer_adapter,
            )
        )

    action_plan = RenderWorkerActionPlan(
        shoot_slug=trusted_plan.shoot_slug,
        renderer_adapter=renderer_adapter,
        actions=tuple(actions),
        blocked_tasks=tuple(blocked_tasks),
    )
    _validate_action_plan(action_plan)
    return action_plan


def plan_stale_render_leases(
    trusted_plan: AssemblyPlan,
    status_manifest: RenderStatusManifest,
    *,
    stale_before: str,
    updated_at: str,
) -> RenderLeaseExpirationPlan:
    stale_before_time = _parse_lease_timestamp(stale_before, "stale_before")
    updated_at_time = _parse_lease_timestamp(updated_at, "updated_at")
    if updated_at_time < stale_before_time:
        raise RenderWorkerError("lease expiration updated_at timestamp cannot be before stale_before")
    try:
        validate_render_status_manifest(status_manifest, trusted_plan=trusted_plan)
    except (RenderStatusError, TypeError) as exc:
        raise RenderWorkerError("Cannot plan stale render leases from an untrusted status manifest") from exc

    expired_leases: list[ExpiredRenderLease] = []
    for status in status_manifest.task_statuses:
        if status.state != "running":
            continue
        if status.updated_at is None or status.renderer_adapter is None:
            raise RenderWorkerError("running render status is missing lease metadata")
        running_since_time = _parse_lease_timestamp(status.updated_at, "running status updated_at")
        if running_since_time >= stale_before_time:
            continue
        retryable_status = RenderTaskStatus(
            task_id=status.task_id,
            state="retryable",
            renderer_adapter=status.renderer_adapter,
            attempts=status.attempts,
            error_message=(
                f"Render worker lease expired after running since {status.updated_at}; "
                "no source, graded, or deliverable files were deleted or cleaned up."
            ),
            updated_at=updated_at,
        )
        _validate_return_status(retryable_status, expected_state="retryable")
        expired_leases.append(
            ExpiredRenderLease(
                task_id=status.task_id,
                renderer_adapter=status.renderer_adapter,
                attempt_number=status.attempts,
                running_since=status.updated_at,
                retryable_status=retryable_status,
            )
        )

    expiration_plan = RenderLeaseExpirationPlan(
        shoot_slug=status_manifest.shoot_slug,
        stale_before=stale_before,
        updated_at=updated_at,
        expired_leases=tuple(expired_leases),
    )
    _validate_lease_expiration_plan(expiration_plan)
    return expiration_plan


def claim_render_worker_action(
    current_status: RenderTaskStatus,
    action: RenderWorkerAction,
    *,
    updated_at: str,
) -> RenderTaskStatus:
    _validate_action(action)
    _validate_timestamp(updated_at)
    _validate_claimable_current_status(current_status, action=action)

    running_status = RenderTaskStatus(
        task_id=action.task_id,
        state="running",
        renderer_adapter=action.renderer_adapter,
        attempts=action.attempt_number,
        updated_at=updated_at,
    )
    _validate_return_status(running_status, expected_state="running")
    return running_status


def report_render_worker_success(
    current_status: RenderTaskStatus,
    action: RenderWorkerAction,
    workspace_root: Path | str,
    *,
    updated_at: str,
) -> RenderTaskStatus:
    _validate_action(action)
    _validate_timestamp(updated_at)
    _validate_running_current_status(current_status, action=action)

    succeeded_status = RenderTaskStatus(
        task_id=action.task_id,
        state="succeeded",
        renderer_adapter=action.renderer_adapter,
        attempts=action.attempt_number,
        output_checksums=_output_checksums_for_action(action, workspace_root),
        updated_at=updated_at,
    )
    _validate_return_status(succeeded_status, expected_state="succeeded")
    return succeeded_status


def report_render_worker_retryable(
    current_status: RenderTaskStatus,
    action: RenderWorkerAction,
    *,
    error_message: str,
    updated_at: str,
) -> RenderTaskStatus:
    return _report_worker_error_status(
        current_status,
        action,
        state="retryable",
        error_message=error_message,
        updated_at=updated_at,
    )


def report_render_worker_failure(
    current_status: RenderTaskStatus,
    action: RenderWorkerAction,
    *,
    error_message: str,
    updated_at: str,
) -> RenderTaskStatus:
    return _report_worker_error_status(
        current_status,
        action,
        state="failed",
        error_message=error_message,
        updated_at=updated_at,
    )


def _validate_renderer_adapter(renderer_adapter: str) -> None:
    if not isinstance(renderer_adapter, str) or not _RENDERER_PATTERN.fullmatch(renderer_adapter):
        raise RenderWorkerError("Invalid render worker renderer adapter")


def _completed_dependency_set(completed_dependency_ids: Iterable[str]) -> frozenset[str]:
    if isinstance(completed_dependency_ids, str):
        raise RenderWorkerError("completed_dependency_ids must be an iterable of dependency ids")
    completed: set[str] = set()
    try:
        iterator = iter(completed_dependency_ids)
    except TypeError as exc:
        raise RenderWorkerError("completed_dependency_ids must be iterable") from exc
    for dependency_id in iterator:
        if not isinstance(dependency_id, str) or not dependency_id.strip():
            raise RenderWorkerError("completed_dependency_ids must contain non-empty strings")
        completed.add(dependency_id)
    return frozenset(completed)


def _tasks_by_id(trusted_plan: AssemblyPlan) -> dict[str, RenderTask]:
    tasks_by_id: dict[str, RenderTask] = {}
    for task in trusted_plan.render_tasks:
        tasks_by_id[task.task_id] = task
    return tasks_by_id


def _statuses_by_id(status_manifest: RenderStatusManifest) -> dict[str, RenderTaskStatus]:
    return {status.task_id: status for status in status_manifest.task_statuses}


def _missing_dependencies(
    task: RenderTask,
    *,
    completed_dependencies: frozenset[str],
    render_task_ids: frozenset[str],
    succeeded_render_tasks: frozenset[str],
) -> tuple[str, ...]:
    missing: list[str] = []
    for dependency_id in task.depends_on:
        if dependency_id in render_task_ids:
            if dependency_id not in succeeded_render_tasks:
                missing.append(dependency_id)
            continue
        if dependency_id not in completed_dependencies:
            missing.append(dependency_id)
    return tuple(missing)


def _action_for_task(
    task: RenderTask,
    *,
    status: RenderTaskStatus,
    renderer_adapter: str,
) -> RenderWorkerAction:
    return RenderWorkerAction(
        task_id=task.task_id,
        renderer_adapter=renderer_adapter,
        attempt_number=status.attempts + 1,
        sequence_name=task.sequence_name,
        source_job_id=task.source_job_id,
        output_kind=task.output_kind,
        aspect_ratio=task.aspect_ratio,
        inputs=task.inputs,
        outputs=task.outputs,
        depends_on=task.depends_on,
        can_run_in_parallel=task.can_run_in_parallel,
    )


def _validate_action_plan(action_plan: RenderWorkerActionPlan) -> None:
    if not isinstance(action_plan, RenderWorkerActionPlan):
        raise RenderWorkerError("render worker action plan has an invalid return type")
    if not isinstance(action_plan.shoot_slug, str) or not action_plan.shoot_slug.strip():
        raise RenderWorkerError("render worker action plan shoot_slug cannot be empty")
    _validate_renderer_adapter(action_plan.renderer_adapter)
    if not isinstance(action_plan.actions, tuple):
        raise RenderWorkerError("render worker actions must be a tuple")
    if not isinstance(action_plan.blocked_tasks, tuple):
        raise RenderWorkerError("render worker blocked_tasks must be a tuple")
    for action in action_plan.actions:
        _validate_action(action)
    for blocked_task in action_plan.blocked_tasks:
        _validate_blocked_task(blocked_task)


def _validate_action(action: RenderWorkerAction) -> None:
    if not isinstance(action, RenderWorkerAction):
        raise RenderWorkerError("render worker action has an invalid return type")
    _validate_non_empty_string(action.task_id, "task_id")
    _validate_renderer_adapter(action.renderer_adapter)
    if isinstance(action.attempt_number, bool) or not isinstance(action.attempt_number, int) or action.attempt_number < 1:
        raise RenderWorkerError("render worker action attempt_number must be positive")
    for value_name in ("sequence_name", "source_job_id", "output_kind", "aspect_ratio"):
        _validate_non_empty_string(getattr(action, value_name), value_name)
    _validate_string_tuple(action.inputs, "inputs")
    _validate_string_tuple(action.outputs, "outputs")
    _validate_output_paths(action.outputs)
    _validate_string_tuple(action.depends_on, "depends_on")
    if not isinstance(action.can_run_in_parallel, bool):
        raise RenderWorkerError("render worker action can_run_in_parallel must be a bool")


def _validate_blocked_task(blocked_task: BlockedRenderTask) -> None:
    if not isinstance(blocked_task, BlockedRenderTask):
        raise RenderWorkerError("render worker blocked task has an invalid return type")
    _validate_non_empty_string(blocked_task.task_id, "blocked task_id")
    _validate_string_tuple(blocked_task.missing_dependencies, "missing_dependencies")


def _validate_lease_expiration_plan(expiration_plan: RenderLeaseExpirationPlan) -> None:
    if not isinstance(expiration_plan, RenderLeaseExpirationPlan):
        raise RenderWorkerError("render lease expiration plan has an invalid return type")
    _validate_non_empty_string(expiration_plan.shoot_slug, "lease expiration shoot_slug")
    _parse_lease_timestamp(expiration_plan.stale_before, "stale_before")
    _parse_lease_timestamp(expiration_plan.updated_at, "updated_at")
    if not isinstance(expiration_plan.expired_leases, tuple):
        raise RenderWorkerError("expired render leases must be a tuple")
    seen_task_ids: set[str] = set()
    for expired_lease in expiration_plan.expired_leases:
        _validate_expired_lease(expired_lease)
        if expired_lease.task_id in seen_task_ids:
            raise RenderWorkerError(f"duplicate expired render lease task: {expired_lease.task_id}")
        seen_task_ids.add(expired_lease.task_id)


def _validate_expired_lease(expired_lease: ExpiredRenderLease) -> None:
    if not isinstance(expired_lease, ExpiredRenderLease):
        raise RenderWorkerError("expired render lease has an invalid return type")
    _validate_non_empty_string(expired_lease.task_id, "expired lease task_id")
    _validate_renderer_adapter(expired_lease.renderer_adapter)
    if (
        isinstance(expired_lease.attempt_number, bool)
        or not isinstance(expired_lease.attempt_number, int)
        or expired_lease.attempt_number < 1
    ):
        raise RenderWorkerError("expired render lease attempt_number must be positive")
    _parse_lease_timestamp(expired_lease.running_since, "expired lease running_since")
    _validate_current_status(expired_lease.retryable_status)
    if expired_lease.retryable_status.task_id != expired_lease.task_id:
        raise RenderWorkerError("expired render lease status task does not match")
    if expired_lease.retryable_status.state != "retryable":
        raise RenderWorkerError("expired render lease status must be retryable")
    if expired_lease.retryable_status.renderer_adapter != expired_lease.renderer_adapter:
        raise RenderWorkerError("expired render lease renderer adapter does not match")
    if expired_lease.retryable_status.attempts != expired_lease.attempt_number:
        raise RenderWorkerError("expired render lease attempts do not match")
    if expired_lease.retryable_status.error_message is None:
        raise RenderWorkerError("expired render lease must include an error message")
    if expired_lease.retryable_status.output_checksums:
        raise RenderWorkerError("expired render lease cannot include output checksums")


def _validate_non_empty_string(value: object, label: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise RenderWorkerError(f"render worker {label} must be a non-empty string")


def _validate_string_tuple(value: object, label: str) -> None:
    if not isinstance(value, tuple):
        raise RenderWorkerError(f"render worker {label} must be a tuple")
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise RenderWorkerError(f"render worker {label} must contain non-empty strings")


def _validate_output_paths(outputs: tuple[str, ...]) -> None:
    seen_outputs: set[str] = set()
    for output in outputs:
        _validate_render_output_path(output)
        if output in seen_outputs:
            raise RenderWorkerError(f"render worker outputs contain a duplicate path: {output}")
        seen_outputs.add(output)


def _validate_render_output_path(path: str) -> None:
    artifact_path = Path(path)
    if artifact_path.is_absolute() or ".." in artifact_path.parts:
        raise RenderWorkerError(f"Unsafe render worker output path: {path}")
    if not artifact_path.parts or artifact_path.parts[0] != "deliverables":
        raise RenderWorkerError(f"Render worker output must be under deliverables: {path}")


def _validate_timestamp(timestamp: str) -> None:
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise RenderWorkerError("render worker updated_at must be a non-empty string")
    if len(timestamp) > 80 or "\x00" in timestamp or "\n" in timestamp or "\r" in timestamp:
        raise RenderWorkerError("render worker updated_at is invalid")


def _parse_lease_timestamp(timestamp: str, label: str) -> datetime:
    try:
        _validate_timestamp(timestamp)
    except RenderWorkerError as exc:
        raise RenderWorkerError(f"lease expiration {label} timestamp is invalid") from exc
    if "T" not in timestamp:
        raise RenderWorkerError(f"lease expiration {label} timestamp must be ISO 8601")
    normalized_timestamp = timestamp[:-1] + "+00:00" if timestamp.endswith("Z") else timestamp
    try:
        parsed = datetime.fromisoformat(normalized_timestamp)
    except ValueError as exc:
        raise RenderWorkerError(f"lease expiration {label} timestamp must be ISO 8601") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise RenderWorkerError(f"lease expiration {label} timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def _validate_error_message(message: str) -> None:
    if not isinstance(message, str) or not message.strip():
        raise RenderWorkerError("render worker error_message must be a non-empty string")
    if len(message) > 2000 or "\x00" in message:
        raise RenderWorkerError("render worker error_message is invalid")


def _validate_current_status(status: RenderTaskStatus) -> None:
    if not isinstance(status, RenderTaskStatus):
        raise RenderWorkerError("current status must be a RenderTaskStatus")
    _validate_non_empty_string(status.task_id, "current status task_id")
    if status.state not in {"pending", "running", "succeeded", "failed", "retryable"}:
        raise RenderWorkerError("current status has an unsupported state")
    if isinstance(status.attempts, bool) or not isinstance(status.attempts, int) or status.attempts < 0:
        raise RenderWorkerError("current status attempts must be a non-negative integer")
    if status.renderer_adapter is not None:
        _validate_renderer_adapter(status.renderer_adapter)
    if status.updated_at is not None:
        _validate_timestamp(status.updated_at)
    if status.error_message is not None:
        _validate_error_message(status.error_message)
    if not isinstance(status.output_checksums, tuple):
        raise RenderWorkerError("current status output_checksums must be a tuple")


def _validate_claimable_current_status(
    current_status: RenderTaskStatus,
    *,
    action: RenderWorkerAction,
) -> None:
    _validate_current_status(current_status)
    if current_status.task_id != action.task_id:
        raise RenderWorkerError("current status task does not match render worker action")
    if current_status.state not in _RUNNABLE_STATES:
        raise RenderWorkerError("current status is not claimable for this render worker action")
    if current_status.attempts + 1 != action.attempt_number:
        raise RenderWorkerError("current status attempts do not match render worker action")


def _validate_running_current_status(
    current_status: RenderTaskStatus,
    *,
    action: RenderWorkerAction,
) -> None:
    _validate_current_status(current_status)
    if current_status.task_id != action.task_id:
        raise RenderWorkerError("current status task does not match render worker action")
    if current_status.state != "running":
        raise RenderWorkerError("current status must be running before reporting a render result")
    if current_status.renderer_adapter != action.renderer_adapter:
        raise RenderWorkerError("current status renderer adapter does not match render worker action")
    if current_status.attempts != action.attempt_number:
        raise RenderWorkerError("current status attempts do not match render worker action")
    if current_status.output_checksums:
        raise RenderWorkerError("current status cannot include output checksums before success")
    if current_status.error_message is not None:
        raise RenderWorkerError("current status cannot include an error before reporting a render result")


def _report_worker_error_status(
    current_status: RenderTaskStatus,
    action: RenderWorkerAction,
    *,
    state: str,
    error_message: str,
    updated_at: str,
) -> RenderTaskStatus:
    _validate_action(action)
    _validate_timestamp(updated_at)
    _validate_error_message(error_message)
    _validate_running_current_status(current_status, action=action)
    if state not in {"failed", "retryable"}:
        raise RenderWorkerError("render worker error status must be failed or retryable")

    error_status = RenderTaskStatus(
        task_id=action.task_id,
        state=state,  # type: ignore[arg-type]
        renderer_adapter=action.renderer_adapter,
        attempts=action.attempt_number,
        error_message=error_message,
        updated_at=updated_at,
    )
    _validate_return_status(error_status, expected_state=state)
    return error_status


def _output_checksums_for_action(
    action: RenderWorkerAction,
    workspace_root: Path | str,
) -> tuple[OutputChecksum, ...]:
    root = Path(workspace_root)
    if root.is_symlink():
        raise RenderWorkerError(f"Refusing render worker workspace symlink: {root}")
    checksums: list[OutputChecksum] = []
    for output in action.outputs:
        output_path = _workspace_output_path(root, output)
        _reject_symlink_path(output_path, root, "render output")
        if not output_path.exists():
            raise RenderWorkerError(f"Missing render output: {output}")
        if not output_path.is_file():
            raise RenderWorkerError(f"Render output is not a file: {output}")
        checksums.append(
            OutputChecksum(
                path=output,
                sha256=_sha256_file(output_path),
            )
        )
    return tuple(checksums)


def _workspace_output_path(root: Path, output: str) -> Path:
    _validate_render_output_path(output)
    output_path = root / output
    try:
        output_path.relative_to(root)
    except ValueError as exc:
        raise RenderWorkerError(f"Render output escapes workspace: {output}") from exc
    return output_path


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as output_file:
            for chunk in iter(lambda: output_file.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise RenderWorkerError(f"Unable to checksum render output: {path}") from exc
    return digest.hexdigest()


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    current = path
    while True:
        if current.is_symlink():
            raise RenderWorkerError(f"Refusing {label} symlink: {current}")
        if current == root or current.absolute() == root.absolute():
            break
        if current.parent == current:
            break
        current = current.parent


def _validate_return_status(status: RenderTaskStatus, *, expected_state: str) -> None:
    _validate_current_status(status)
    if status.state != expected_state:
        raise RenderWorkerError("render worker returned an unexpected status state")
