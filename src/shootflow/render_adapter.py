from __future__ import annotations

import hashlib
import json
import os
import uuid
from dataclasses import dataclass
from pathlib import Path

from shootflow.assembly import AssemblyPlan
from shootflow.render_status import (
    RenderStatusManifest,
    RenderTaskStatus,
    compare_and_write_render_task_status,
    load_render_status_manifest,
)
from shootflow.render_worker import (
    RenderWorkerAction,
    RenderWorkerError,
    claim_render_worker_action,
    report_render_worker_retryable,
    report_render_worker_success,
)


class DryRunRendererError(ValueError):
    """Raised when the dry-run renderer cannot safely materialize declared outputs."""


@dataclass(frozen=True)
class DryRunRenderResult:
    task_id: str
    claimed_status: RenderTaskStatus
    final_status: RenderTaskStatus
    manifest: RenderStatusManifest
    outputs_materialized: tuple[str, ...]


def run_dry_run_render_action(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
    action: RenderWorkerAction,
    started_at: str,
    completed_at: str,
) -> DryRunRenderResult:
    """Persist a ready action through claim, dry-run output materialization, and result status.

    The dry-run adapter is intentionally conservative: it consumes only the trusted
    RenderWorkerAction, writes only the declared deliverable outputs, never opens
    source/graded inputs, and refuses to overwrite an existing different output.
    """

    _validate_action(action)
    _validate_timestamp(started_at, "started_at")
    _validate_timestamp(completed_at, "completed_at")
    root = _workspace_root(workspace_root)

    current_manifest = load_render_status_manifest(root, trusted_plan=trusted_plan)
    current_status = _status_for_action(current_manifest, action)
    running_status = claim_render_worker_action(
        current_status,
        action,
        updated_at=started_at,
    )
    compare_and_write_render_task_status(
        root,
        trusted_plan=trusted_plan,
        updated_status=running_status,
        expected_state=current_status.state,
        expected_attempts=current_status.attempts,
        expected_updated_at=current_status.updated_at,
    )

    try:
        outputs_materialized = materialize_dry_run_render_outputs(action, root)
        final_status = report_render_worker_success(
            running_status,
            action,
            root,
            updated_at=completed_at,
        )
    except (DryRunRendererError, RenderWorkerError) as exc:
        outputs_materialized = ()
        final_status = report_render_worker_retryable(
            running_status,
            action,
            error_message=_retryable_error_message(exc),
            updated_at=completed_at,
        )

    final_manifest = compare_and_write_render_task_status(
        root,
        trusted_plan=trusted_plan,
        updated_status=final_status,
        expected_state="running",
        expected_attempts=action.attempt_number,
        expected_updated_at=started_at,
    )
    result = DryRunRenderResult(
        task_id=action.task_id,
        claimed_status=running_status,
        final_status=final_status,
        manifest=final_manifest,
        outputs_materialized=outputs_materialized,
    )
    _validate_result(result)
    return result


def materialize_dry_run_render_outputs(
    action: RenderWorkerAction,
    workspace_root: Path | str,
) -> tuple[str, ...]:
    """Create deterministic placeholder deliverables for a trusted render action."""

    _validate_action(action)
    root = _workspace_root(workspace_root)
    materialized: list[str] = []
    for output in action.outputs:
        _write_dry_run_output(root, action=action, output=output)
        materialized.append(output)
    return tuple(materialized)


def _validate_action(action: RenderWorkerAction) -> None:
    if not isinstance(action, RenderWorkerAction):
        raise DryRunRendererError("action must be a RenderWorkerAction")
    if not isinstance(action.outputs, tuple) or not action.outputs:
        raise DryRunRendererError("dry-run render action must declare at least one output")
    seen_outputs: set[str] = set()
    for output in action.outputs:
        _validate_deliverable_output_path(output)
        if output in seen_outputs:
            raise DryRunRendererError(f"dry-run render action has duplicate output: {output}")
        seen_outputs.add(output)


def _validate_timestamp(timestamp: str, label: str) -> None:
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise DryRunRendererError(f"dry-run renderer {label} must be a non-empty string")
    if len(timestamp) > 80 or "\x00" in timestamp or "\n" in timestamp or "\r" in timestamp:
        raise DryRunRendererError(f"dry-run renderer {label} is invalid")


def _workspace_root(workspace_root: Path | str) -> Path:
    root = Path(workspace_root)
    if root.is_symlink():
        raise DryRunRendererError(f"Refusing dry-run renderer workspace symlink: {root}")
    return root


def _status_for_action(
    manifest: RenderStatusManifest,
    action: RenderWorkerAction,
) -> RenderTaskStatus:
    for status in manifest.task_statuses:
        if status.task_id == action.task_id:
            return status
    raise DryRunRendererError(f"Missing render status for action: {action.task_id}")


def _write_dry_run_output(
    root: Path,
    *,
    action: RenderWorkerAction,
    output: str,
) -> None:
    content = _dry_run_output_bytes(action, output=output)
    expected_sha256 = hashlib.sha256(content).hexdigest()
    output_path = _workspace_deliverable_path(root, output)

    _reject_symlink_path(output_path.parent, root, "dry-run output directory")
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise DryRunRendererError(f"Unable to create dry-run output directory: {output_path.parent}") from exc
    _reject_symlink_path(output_path.parent, root, "dry-run output directory")
    _reject_symlink_path(output_path, root, "dry-run output")

    if output_path.exists():
        _validate_existing_output(output_path, output=output, expected_sha256=expected_sha256)
        return

    temp_path = output_path.with_name(f".{output_path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    _reject_symlink_path(temp_path, root, "temporary dry-run output")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW

    try:
        fd = os.open(temp_path, flags, 0o600)
    except OSError as exc:
        raise DryRunRendererError(f"Unable to create temporary dry-run output: {temp_path}") from exc

    try:
        with os.fdopen(fd, "wb") as temp_file:
            temp_file.write(content)
        _reject_symlink_path(temp_path, root, "temporary dry-run output")
        try:
            os.link(temp_path, output_path)
        except FileExistsError:
            _validate_existing_output(output_path, output=output, expected_sha256=expected_sha256)
        except OSError as exc:
            raise DryRunRendererError(f"Unable to commit dry-run output: {output}") from exc
    except OSError as exc:
        raise DryRunRendererError(f"Unable to write dry-run output: {output}") from exc
    finally:
        try:
            temp_path.unlink()
        except FileNotFoundError:
            pass


def _dry_run_output_bytes(action: RenderWorkerAction, *, output: str) -> bytes:
    payload = {
        "schema_version": 1,
        "adapter": "shootflow-dry-run",
        "task_id": action.task_id,
        "sequence_name": action.sequence_name,
        "source_job_id": action.source_job_id,
        "output_kind": action.output_kind,
        "aspect_ratio": action.aspect_ratio,
        "inputs": list(action.inputs),
        "outputs": list(action.outputs),
        "selected_output": output,
        "depends_on": list(action.depends_on),
        "can_run_in_parallel": action.can_run_in_parallel,
    }
    return (json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _workspace_deliverable_path(root: Path, output: str) -> Path:
    _validate_deliverable_output_path(output)
    output_path = root / output
    try:
        output_path.relative_to(root)
    except ValueError as exc:
        raise DryRunRendererError(f"Dry-run output escapes workspace: {output}") from exc
    return output_path


def _validate_deliverable_output_path(output: str) -> None:
    if not isinstance(output, str) or not output.strip():
        raise DryRunRendererError("dry-run output path cannot be empty")
    output_path = Path(output)
    if output_path.is_absolute() or ".." in output_path.parts:
        raise DryRunRendererError(f"Unsafe dry-run output path: {output}")
    if not output_path.parts or output_path.parts[0] != "deliverables":
        raise DryRunRendererError(f"Dry-run output must be under deliverables: {output}")


def _validate_existing_output(
    output_path: Path,
    *,
    output: str,
    expected_sha256: str,
) -> None:
    if not output_path.is_file():
        raise DryRunRendererError(f"Refusing non-file dry-run output: {output}")
    if _sha256_file(output_path) != expected_sha256:
        raise DryRunRendererError(f"Refusing to overwrite existing different dry-run output: {output}")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as output_file:
            for chunk in iter(lambda: output_file.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise DryRunRendererError(f"Unable to checksum dry-run output: {path}") from exc
    return digest.hexdigest()


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    current = path
    while True:
        if current.is_symlink():
            raise DryRunRendererError(f"Refusing {label} symlink: {current}")
        if current == root or current.absolute() == root.absolute():
            break
        if current.parent == current:
            break
        current = current.parent


def _retryable_error_message(exc: Exception) -> str:
    detail = str(exc).strip() or exc.__class__.__name__
    if len(detail) > 1500:
        detail = detail[:1497] + "..."
    return (
        "Dry-run renderer could not materialize declared outputs: "
        f"{detail}. No source, graded, or deliverable files were deleted."
    )


def _validate_result(result: DryRunRenderResult) -> None:
    if not isinstance(result, DryRunRenderResult):
        raise DryRunRendererError("dry-run renderer returned an invalid result")
    if not isinstance(result.task_id, str) or not result.task_id.strip():
        raise DryRunRendererError("dry-run renderer result task_id cannot be empty")
    if not isinstance(result.claimed_status, RenderTaskStatus):
        raise DryRunRendererError("dry-run renderer result claimed_status is invalid")
    if not isinstance(result.final_status, RenderTaskStatus):
        raise DryRunRendererError("dry-run renderer result final_status is invalid")
    if not isinstance(result.manifest, RenderStatusManifest):
        raise DryRunRendererError("dry-run renderer result manifest is invalid")
    if not isinstance(result.outputs_materialized, tuple):
        raise DryRunRendererError("dry-run renderer result outputs_materialized must be a tuple")
    for output in result.outputs_materialized:
        _validate_deliverable_output_path(output)
