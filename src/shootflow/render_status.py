from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from shootflow.assembly import AssemblyPlan, RenderTask

RenderTaskState = Literal["pending", "running", "succeeded", "failed", "retryable"]
RENDER_STATUS_MANIFEST_PATH = "deliverables/render_status.json"
_RENDER_STATUS_SCHEMA_VERSION = 1

_MANIFEST_KEYS = frozenset({"schema_version", "shoot_slug", "task_statuses"})
_STATUS_KEYS = frozenset(
    {
        "task_id",
        "state",
        "renderer_adapter",
        "attempts",
        "error_message",
        "output_checksums",
        "updated_at",
    }
)
_CHECKSUM_KEYS = frozenset({"path", "sha256"})
_STATES = frozenset({"pending", "running", "succeeded", "failed", "retryable"})
_RENDERER_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class RenderStatusError(ValueError):
    """Raised when render-worker status cannot be trusted."""


@dataclass(frozen=True)
class OutputChecksum:
    path: str
    sha256: str


@dataclass(frozen=True)
class RenderTaskStatus:
    task_id: str
    state: RenderTaskState
    renderer_adapter: str | None = None
    attempts: int = 0
    error_message: str | None = None
    output_checksums: tuple[OutputChecksum, ...] = ()
    updated_at: str | None = None


@dataclass(frozen=True)
class RenderStatusManifest:
    shoot_slug: str
    task_statuses: tuple[RenderTaskStatus, ...]


def build_initial_render_status_manifest(trusted_plan: AssemblyPlan) -> RenderStatusManifest:
    _validate_trusted_plan(trusted_plan)
    return RenderStatusManifest(
        shoot_slug=trusted_plan.shoot_slug,
        task_statuses=tuple(
            RenderTaskStatus(task_id=task.task_id, state="pending")
            for task in trusted_plan.render_tasks
        ),
    )


def write_render_status_manifest(
    manifest: RenderStatusManifest,
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
) -> Path:
    _validate_manifest(manifest, trusted_plan=trusted_plan)

    manifest_path = _render_status_manifest_path(workspace_root)
    root = Path(workspace_root)
    _reject_symlink_path(manifest_path.parent, root, "render status manifest directory")
    try:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise RenderStatusError(
            f"Unable to create render status manifest directory: {manifest_path.parent}"
        ) from exc
    _reject_symlink_path(manifest_path.parent, root, "render status manifest directory")
    _reject_symlink_path(manifest_path, root, "render status manifest")

    temp_path = manifest_path.with_suffix(".json.tmp")
    _reject_symlink_path(temp_path, root, "temporary render status manifest")
    temp_path.write_text(_manifest_json(manifest), encoding="utf-8")
    temp_path.replace(manifest_path)
    return manifest_path


def load_render_status_manifest(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
) -> RenderStatusManifest:
    _validate_trusted_plan(trusted_plan)

    manifest_path = _render_status_manifest_path(workspace_root)
    root = Path(workspace_root)
    _reject_symlink_path(manifest_path.parent, root, "render status manifest directory")
    _reject_symlink_path(manifest_path, root, "render status manifest")
    _reject_symlink_path(
        manifest_path.with_suffix(".json.tmp"),
        root,
        "temporary render status manifest",
    )

    manifest = _manifest_from_json(_read_json_object(manifest_path))
    _validate_manifest(manifest, trusted_plan=trusted_plan)
    return manifest


def _validate_manifest(manifest: RenderStatusManifest, *, trusted_plan: AssemblyPlan) -> None:
    _validate_trusted_plan(trusted_plan)
    if not isinstance(manifest, RenderStatusManifest):
        raise RenderStatusError("manifest must be a RenderStatusManifest")
    if manifest.shoot_slug != trusted_plan.shoot_slug:
        raise RenderStatusError("Render status shoot slug does not match trusted assembly plan")
    if not isinstance(manifest.task_statuses, tuple):
        raise RenderStatusError("Render status task_statuses must be a tuple")

    tasks_by_id = _trusted_tasks_by_id(trusted_plan)
    expected_task_ids = tuple(tasks_by_id)
    actual_task_ids = tuple(status.task_id for status in manifest.task_statuses)
    if actual_task_ids != expected_task_ids:
        raise RenderStatusError("Render status manifest does not match trusted render tasks")

    for status in manifest.task_statuses:
        _validate_status(status, trusted_task=tasks_by_id[status.task_id])


def _validate_trusted_plan(plan: AssemblyPlan) -> None:
    if not isinstance(plan, AssemblyPlan):
        raise TypeError("trusted_plan must be an AssemblyPlan")
    if not isinstance(plan.shoot_slug, str) or not plan.shoot_slug.strip():
        raise RenderStatusError("Trusted assembly plan shoot_slug cannot be empty")
    if not isinstance(plan.render_tasks, tuple):
        raise RenderStatusError("Trusted assembly plan render_tasks must be a tuple")
    _trusted_tasks_by_id(plan)


def _trusted_tasks_by_id(plan: AssemblyPlan) -> dict[str, RenderTask]:
    tasks_by_id: dict[str, RenderTask] = {}
    for task in plan.render_tasks:
        if not isinstance(task, RenderTask):
            raise RenderStatusError("Trusted assembly plan task must be a RenderTask")
        if not isinstance(task.task_id, str) or not task.task_id.strip():
            raise RenderStatusError("Trusted render task id cannot be empty")
        if task.task_id in tasks_by_id:
            raise RenderStatusError(f"Duplicate trusted render task id: {task.task_id}")
        tasks_by_id[task.task_id] = task
    return tasks_by_id


def _validate_status(status: RenderTaskStatus, *, trusted_task: RenderTask) -> None:
    if not isinstance(status, RenderTaskStatus):
        raise RenderStatusError("Render status entry must be a RenderTaskStatus")
    if status.task_id != trusted_task.task_id:
        raise RenderStatusError("Render status task does not match trusted render task")
    if status.state not in _STATES:
        raise RenderStatusError(f"Unsupported render status state: {status.state}")
    if isinstance(status.attempts, bool) or not isinstance(status.attempts, int) or status.attempts < 0:
        raise RenderStatusError(f"Render status attempts must be a non-negative integer: {status.task_id}")
    if status.renderer_adapter is not None and not _RENDERER_PATTERN.fullmatch(status.renderer_adapter):
        raise RenderStatusError(f"Invalid render status renderer adapter: {status.task_id}")
    if status.error_message is not None:
        _validate_error_message(status.error_message, task_id=status.task_id)
    if status.updated_at is not None:
        _validate_timestamp(status.updated_at, task_id=status.task_id)
    if not isinstance(status.output_checksums, tuple):
        raise RenderStatusError(f"Render status output checksums must be a tuple: {status.task_id}")

    output_paths = _validate_output_checksums(status.output_checksums, trusted_task=trusted_task)
    if status.state == "pending":
        _validate_pending_status(status)
    elif status.state == "running":
        _validate_running_status(status)
    elif status.state == "succeeded":
        _validate_succeeded_status(status, trusted_task=trusted_task, output_paths=output_paths)
    else:
        _validate_failed_or_retryable_status(status)


def _validate_pending_status(status: RenderTaskStatus) -> None:
    if status.attempts != 0:
        raise RenderStatusError("Pending render status attempts must be zero")
    if status.renderer_adapter is not None:
        raise RenderStatusError("Pending render status cannot include a renderer adapter")
    if status.error_message is not None:
        raise RenderStatusError("Pending render status cannot include an error message")
    if status.output_checksums:
        raise RenderStatusError("Pending render status cannot include output checksums")
    if status.updated_at is not None:
        raise RenderStatusError("Pending render status cannot include an updated timestamp")


def _validate_running_status(status: RenderTaskStatus) -> None:
    _validate_worker_status_base(status)
    if status.error_message is not None:
        raise RenderStatusError("Running render status cannot include an error message")
    if status.output_checksums:
        raise RenderStatusError("Running render status cannot include output checksums")


def _validate_succeeded_status(
    status: RenderTaskStatus,
    *,
    trusted_task: RenderTask,
    output_paths: tuple[str, ...],
) -> None:
    _validate_worker_status_base(status)
    if status.error_message is not None:
        raise RenderStatusError("Succeeded render status cannot include an error message")
    if output_paths != trusted_task.outputs:
        raise RenderStatusError("Succeeded render status must include checksums for every output")


def _validate_failed_or_retryable_status(status: RenderTaskStatus) -> None:
    _validate_worker_status_base(status)
    if status.error_message is None:
        raise RenderStatusError(f"{status.state} render status must include an error message")
    if status.output_checksums:
        raise RenderStatusError(f"{status.state} render status cannot include output checksums")


def _validate_worker_status_base(status: RenderTaskStatus) -> None:
    if status.attempts < 1:
        raise RenderStatusError(f"{status.state} render status attempts must be positive")
    if status.renderer_adapter is None:
        raise RenderStatusError(f"{status.state} render status must include a renderer adapter")
    if status.updated_at is None:
        raise RenderStatusError(f"{status.state} render status must include an updated timestamp")


def _validate_output_checksums(
    checksums: tuple[OutputChecksum, ...],
    *,
    trusted_task: RenderTask,
) -> tuple[str, ...]:
    trusted_outputs = set(trusted_task.outputs)
    seen_paths: set[str] = set()
    output_paths: list[str] = []
    for checksum in checksums:
        if not isinstance(checksum, OutputChecksum):
            raise RenderStatusError(f"Render output checksum must be an OutputChecksum: {trusted_task.task_id}")
        _validate_render_output_path(checksum.path)
        if checksum.path not in trusted_outputs:
            raise RenderStatusError(f"Unexpected checksum output path: {checksum.path}")
        if checksum.path in seen_paths:
            raise RenderStatusError(f"Duplicate checksum output path: {checksum.path}")
        if not isinstance(checksum.sha256, str) or not _SHA256_PATTERN.fullmatch(checksum.sha256):
            raise RenderStatusError(f"Invalid checksum sha256: {checksum.path}")
        seen_paths.add(checksum.path)
        output_paths.append(checksum.path)
    return tuple(output_paths)


def _validate_render_output_path(path: str) -> None:
    if not isinstance(path, str) or not path.strip():
        raise RenderStatusError("Checksum output path cannot be empty")
    artifact_path = Path(path)
    if artifact_path.is_absolute() or ".." in artifact_path.parts:
        raise RenderStatusError(f"Unsafe checksum output path: {path}")
    if not artifact_path.parts or artifact_path.parts[0] != "deliverables":
        raise RenderStatusError(f"Unexpected checksum output path: {path}")


def _validate_error_message(message: str, *, task_id: str) -> None:
    if not isinstance(message, str) or not message.strip():
        raise RenderStatusError(f"Render status error message cannot be empty: {task_id}")
    if len(message) > 2000 or "\x00" in message:
        raise RenderStatusError(f"Render status error message is invalid: {task_id}")


def _validate_timestamp(timestamp: str, *, task_id: str) -> None:
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise RenderStatusError(f"Render status timestamp cannot be empty: {task_id}")
    if len(timestamp) > 80 or "\x00" in timestamp or "\n" in timestamp or "\r" in timestamp:
        raise RenderStatusError(f"Render status timestamp is invalid: {task_id}")


def _render_status_manifest_path(workspace_root: Path | str) -> Path:
    root = Path(workspace_root)
    if root.is_symlink():
        raise RenderStatusError(f"Refusing render status workspace symlink: {root}")
    return root / RENDER_STATUS_MANIFEST_PATH


def _manifest_json(manifest: RenderStatusManifest) -> str:
    return json.dumps(_manifest_to_json(manifest), indent=2, sort_keys=True) + "\n"


def _manifest_to_json(manifest: RenderStatusManifest) -> dict[str, object]:
    return {
        "schema_version": _RENDER_STATUS_SCHEMA_VERSION,
        "shoot_slug": manifest.shoot_slug,
        "task_statuses": [_status_to_json(status) for status in manifest.task_statuses],
    }


def _status_to_json(status: RenderTaskStatus) -> dict[str, object]:
    return {
        "task_id": status.task_id,
        "state": status.state,
        "renderer_adapter": status.renderer_adapter,
        "attempts": status.attempts,
        "error_message": status.error_message,
        "output_checksums": [_checksum_to_json(checksum) for checksum in status.output_checksums],
        "updated_at": status.updated_at,
    }


def _checksum_to_json(checksum: OutputChecksum) -> dict[str, str]:
    return {
        "path": checksum.path,
        "sha256": checksum.sha256,
    }


def _read_json_object(path: Path) -> dict[str, object]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RenderStatusError(f"Missing render status manifest: {path}") from exc
    except json.JSONDecodeError as exc:
        raise RenderStatusError(f"Invalid render status manifest JSON: {path}") from exc
    if not isinstance(raw, dict):
        raise RenderStatusError(f"Render status manifest root must be an object: {path}")
    return raw


def _manifest_from_json(raw_manifest: dict[str, object]) -> RenderStatusManifest:
    _validate_exact_keys(raw_manifest, allowed_keys=_MANIFEST_KEYS, label="manifest")
    if raw_manifest.get("schema_version") != _RENDER_STATUS_SCHEMA_VERSION:
        raise RenderStatusError("Unsupported render status manifest schema version")
    raw_statuses = raw_manifest.get("task_statuses")
    if not isinstance(raw_statuses, list):
        raise RenderStatusError("Render status manifest must contain a task_statuses list")
    return RenderStatusManifest(
        shoot_slug=_required_manifest_string(raw_manifest, "shoot_slug"),
        task_statuses=tuple(_status_from_json(raw_status) for raw_status in raw_statuses),
    )


def _status_from_json(raw_status: object) -> RenderTaskStatus:
    if not isinstance(raw_status, dict):
        raise RenderStatusError("Render status entry must be an object")
    _validate_exact_keys(raw_status, allowed_keys=_STATUS_KEYS, label="field")
    return RenderTaskStatus(
        task_id=_required_status_string(raw_status, "task_id"),
        state=_required_state(raw_status),
        renderer_adapter=_optional_status_string(raw_status, "renderer_adapter"),
        attempts=_required_status_int(raw_status, "attempts"),
        error_message=_optional_status_string(raw_status, "error_message"),
        output_checksums=_required_output_checksums(raw_status),
        updated_at=_optional_status_string(raw_status, "updated_at"),
    )


def _required_output_checksums(raw_status: dict[object, object]) -> tuple[OutputChecksum, ...]:
    value = raw_status.get("output_checksums")
    if not isinstance(value, list):
        raise RenderStatusError("Render status output_checksums must be a list")
    checksums: list[OutputChecksum] = []
    for raw_checksum in value:
        if not isinstance(raw_checksum, dict):
            raise RenderStatusError("Render output checksum must be an object")
        _validate_exact_keys(raw_checksum, allowed_keys=_CHECKSUM_KEYS, label="checksum")
        checksums.append(
            OutputChecksum(
                path=_required_status_string(raw_checksum, "path"),
                sha256=_required_status_string(raw_checksum, "sha256"),
            )
        )
    return tuple(checksums)


def _required_manifest_string(raw_manifest: dict[object, object], key: str) -> str:
    value = raw_manifest.get(key)
    if not isinstance(value, str) or not value.strip():
        raise RenderStatusError(f"Render status manifest field must be a non-empty string: {key}")
    return value


def _required_status_string(raw_status: dict[object, object], key: str) -> str:
    value = raw_status.get(key)
    if not isinstance(value, str) or not value.strip():
        raise RenderStatusError(f"Render status field must be a non-empty string: {key}")
    return value


def _optional_status_string(raw_status: dict[object, object], key: str) -> str | None:
    value = raw_status.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise RenderStatusError(f"Render status field must be null or a non-empty string: {key}")
    return value


def _required_state(raw_status: dict[object, object]) -> RenderTaskState:
    value = _required_status_string(raw_status, "state")
    if value not in _STATES:
        raise RenderStatusError(f"Unsupported render status state: {value}")
    return value  # type: ignore[return-value]


def _required_status_int(raw_status: dict[object, object], key: str) -> int:
    value = raw_status.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise RenderStatusError(f"Render status field must be an integer: {key}")
    return value


def _validate_exact_keys(
    raw_object: dict[object, object],
    *,
    allowed_keys: frozenset[str],
    label: str,
) -> None:
    actual_keys = set(raw_object)
    unexpected_keys = sorted(str(key) for key in actual_keys - allowed_keys)
    if unexpected_keys:
        raise RenderStatusError(f"Unexpected render status {label}: {', '.join(unexpected_keys)}")
    missing_keys = sorted(allowed_keys - actual_keys)
    if missing_keys:
        raise RenderStatusError(f"Missing render status {label}: {', '.join(missing_keys)}")


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    current = path
    while True:
        if current.is_symlink():
            raise RenderStatusError(f"Refusing {label} symlink: {current}")
        if current == root or current.absolute() == root.absolute():
            break
        if current.parent == current:
            break
        current = current.parent
