from __future__ import annotations

import hashlib
import json
import os
import uuid
from dataclasses import dataclass
from pathlib import Path

from shootflow.production import ProductionJob, ProductionPlan
from shootflow.production_status import (
    ProductionJobStatus,
    ProductionStatusManifest,
    compare_and_write_production_job_status,
    load_production_status_manifest,
)
from shootflow.production_worker import (
    ProductionWorkerAction,
    ProductionWorkerError,
    claim_production_worker_action,
    report_production_worker_retryable,
    report_production_worker_success,
)

_DRY_RUN_PRODUCTION_ADAPTER = "dry-run-production-local"


class DryRunProductionError(ValueError):
    """Raised when the dry-run production adapter cannot safely run a job."""


@dataclass(frozen=True)
class DryRunProductionAdapterResult:
    job_id: str
    claimed_status: ProductionJobStatus
    final_status: ProductionJobStatus
    manifest: ProductionStatusManifest
    outputs_materialized: tuple[str, ...]


def supported_production_adapter_names() -> tuple[str, ...]:
    """Return production adapter names that this build can execute locally."""

    return (_DRY_RUN_PRODUCTION_ADAPTER,)


def run_dry_run_production_action(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action: ProductionWorkerAction,
    started_at: str,
    completed_at: str,
) -> DryRunProductionAdapterResult:
    """Persist one trusted production action through claim, dry-run output, and result.

    This adapter proves the pre-render production-worker status handoff without
    running real proxy, VLM, color, or storyline tools. It writes only the
    declared production outputs and reports success or retryable status through
    the guarded production-status compare/write boundary.
    """

    _validate_action(action, expected_adapter=_DRY_RUN_PRODUCTION_ADAPTER)
    _validate_action_matches_trusted_plan(action, trusted_plan=trusted_plan)
    _validate_timestamp(started_at, "started_at")
    _validate_timestamp(completed_at, "completed_at")
    root = _workspace_root(workspace_root)

    current_manifest = load_production_status_manifest(root, trusted_plan=trusted_plan)
    current_status = _status_for_action(current_manifest, action)
    try:
        running_status = claim_production_worker_action(
            current_status,
            action,
            updated_at=started_at,
        )
    except ProductionWorkerError as exc:
        raise DryRunProductionError(str(exc)) from exc
    compare_and_write_production_job_status(
        root,
        trusted_plan=trusted_plan,
        updated_status=running_status,
        expected_state=current_status.state,
        expected_attempts=current_status.attempts,
        expected_updated_at=current_status.updated_at,
    )

    try:
        outputs_materialized = _materialize_dry_run_production_outputs(action, root)
        final_status = report_production_worker_success(
            running_status,
            action,
            root,
            updated_at=completed_at,
        )
    except (DryRunProductionError, ProductionWorkerError) as exc:
        outputs_materialized = ()
        final_status = report_production_worker_retryable(
            running_status,
            action,
            error_message=_retryable_error_message(exc),
            updated_at=completed_at,
        )

    final_manifest = compare_and_write_production_job_status(
        root,
        trusted_plan=trusted_plan,
        updated_status=final_status,
        expected_state="running",
        expected_attempts=action.attempt_number,
        expected_updated_at=started_at,
    )
    result = DryRunProductionAdapterResult(
        job_id=action.job_id,
        claimed_status=running_status,
        final_status=final_status,
        manifest=final_manifest,
        outputs_materialized=outputs_materialized,
    )
    _validate_result(result)
    return result


def _materialize_dry_run_production_outputs(
    action: ProductionWorkerAction,
    workspace_root: Path | str,
) -> tuple[str, ...]:
    """Create deterministic placeholder artifacts for a trusted production action."""

    _validate_action(action, expected_adapter=_DRY_RUN_PRODUCTION_ADAPTER)
    root = _workspace_root(workspace_root)
    materialized: list[str] = []
    for output in action.outputs:
        _write_dry_run_output(root, action=action, output=output)
        materialized.append(output)
    return tuple(materialized)


def _validate_action(
    action: ProductionWorkerAction,
    *,
    expected_adapter: str | None = None,
) -> None:
    if not isinstance(action, ProductionWorkerAction):
        raise DryRunProductionError("action must be a ProductionWorkerAction")
    if not isinstance(action.worker_adapter, str) or not action.worker_adapter.strip():
        raise DryRunProductionError("dry-run production action worker_adapter cannot be empty")
    if expected_adapter is not None and action.worker_adapter != expected_adapter:
        raise DryRunProductionError(
            "dry-run production action worker_adapter must be "
            f"{expected_adapter}: {action.worker_adapter}"
        )
    if not isinstance(action.outputs, tuple) or not action.outputs:
        raise DryRunProductionError("dry-run production action must declare at least one output")
    seen_outputs: set[str] = set()
    for output in action.outputs:
        _validate_production_output_path(output)
        if output in seen_outputs:
            raise DryRunProductionError(f"dry-run production action has duplicate output: {output}")
        seen_outputs.add(output)


def _validate_action_matches_trusted_plan(
    action: ProductionWorkerAction,
    *,
    trusted_plan: ProductionPlan,
) -> None:
    if not isinstance(trusted_plan, ProductionPlan):
        raise DryRunProductionError("trusted_plan must be a ProductionPlan")
    trusted_job = _trusted_job_for_action(action, trusted_plan=trusted_plan)
    expected_fields = (
        "output_kind",
        "inputs",
        "outputs",
        "depends_on",
        "can_run_in_parallel",
    )
    for field_name in expected_fields:
        if getattr(action, field_name) != getattr(trusted_job, field_name):
            raise DryRunProductionError(
                f"dry-run production action {field_name} does not match trusted job: {action.job_id}"
            )


def _trusted_job_for_action(
    action: ProductionWorkerAction,
    *,
    trusted_plan: ProductionPlan,
) -> ProductionJob:
    for job in trusted_plan.jobs:
        if job.job_id == action.job_id:
            return job
    raise DryRunProductionError(f"dry-run production action references unknown trusted job: {action.job_id}")


def _validate_timestamp(timestamp: str, label: str) -> None:
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise DryRunProductionError(f"dry-run production {label} must be a non-empty string")
    if len(timestamp) > 80 or "\x00" in timestamp or "\n" in timestamp or "\r" in timestamp:
        raise DryRunProductionError(f"dry-run production {label} is invalid")


def _workspace_root(workspace_root: Path | str) -> Path:
    root = Path(workspace_root)
    if root.is_symlink():
        raise DryRunProductionError(f"Refusing dry-run production workspace symlink: {root}")
    return root


def _status_for_action(
    manifest: ProductionStatusManifest,
    action: ProductionWorkerAction,
) -> ProductionJobStatus:
    for status in manifest.job_statuses:
        if status.job_id == action.job_id:
            return status
    raise DryRunProductionError(f"Missing production status for action: {action.job_id}")


def _write_dry_run_output(
    root: Path,
    *,
    action: ProductionWorkerAction,
    output: str,
) -> None:
    if output.endswith("/"):
        raise DryRunProductionError(
            "Dry-run production adapter does not materialize directory-style output: "
            f"{output}"
        )
    content = _dry_run_output_bytes(action, output=output)
    expected_sha256 = hashlib.sha256(content).hexdigest()
    output_path = _workspace_output_path(root, output)

    _reject_symlink_path(output_path.parent, root, "dry-run production output directory")
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise DryRunProductionError(
            f"Unable to create dry-run production output directory: {output_path.parent}"
        ) from exc
    _reject_symlink_path(output_path.parent, root, "dry-run production output directory")
    _reject_symlink_path(output_path, root, "dry-run production output")

    if output_path.exists():
        _validate_existing_output(output_path, output=output, expected_sha256=expected_sha256)
        return

    temp_path = output_path.with_name(f".{output_path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    _reject_symlink_path(temp_path, root, "temporary dry-run production output")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW

    try:
        fd = os.open(temp_path, flags, 0o600)
    except OSError as exc:
        raise DryRunProductionError(f"Unable to create temporary dry-run production output: {temp_path}") from exc

    try:
        with os.fdopen(fd, "wb") as temp_file:
            temp_file.write(content)
        _reject_symlink_path(temp_path, root, "temporary dry-run production output")
        try:
            os.link(temp_path, output_path)
        except FileExistsError:
            _validate_existing_output(output_path, output=output, expected_sha256=expected_sha256)
        except OSError as exc:
            raise DryRunProductionError(f"Unable to commit dry-run production output: {output}") from exc
    except OSError as exc:
        raise DryRunProductionError(f"Unable to write dry-run production output: {output}") from exc
    finally:
        try:
            temp_path.unlink()
        except FileNotFoundError:
            pass


def _dry_run_output_bytes(action: ProductionWorkerAction, *, output: str) -> bytes:
    payload = {
        "schema_version": 1,
        "adapter": "shootflow-dry-run-production",
        "job_id": action.job_id,
        "output_kind": action.output_kind,
        "inputs": list(action.inputs),
        "outputs": list(action.outputs),
        "selected_output": output,
        "depends_on": list(action.depends_on),
        "can_run_in_parallel": action.can_run_in_parallel,
    }
    return (json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _workspace_output_path(root: Path, output: str) -> Path:
    _validate_production_output_path(output)
    output_path = root / output
    try:
        output_path.relative_to(root)
    except ValueError as exc:
        raise DryRunProductionError(f"Dry-run production output escapes workspace: {output}") from exc
    return output_path


def _validate_production_output_path(output: str) -> None:
    if not isinstance(output, str) or not output.strip():
        raise DryRunProductionError("dry-run production output path cannot be empty")
    output_path = Path(output)
    if output_path.is_absolute() or ".." in output_path.parts:
        raise DryRunProductionError(f"Unsafe dry-run production output path: {output}")


def _validate_existing_output(
    output_path: Path,
    *,
    output: str,
    expected_sha256: str,
) -> None:
    if not output_path.is_file():
        raise DryRunProductionError(f"Refusing non-file dry-run production output: {output}")
    if _sha256_file(output_path) != expected_sha256:
        raise DryRunProductionError(f"Refusing to overwrite existing different dry-run production output: {output}")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as output_file:
            for chunk in iter(lambda: output_file.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise DryRunProductionError(f"Unable to checksum dry-run production output: {path}") from exc
    return digest.hexdigest()


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    current = path
    while True:
        if current.is_symlink():
            raise DryRunProductionError(f"Refusing {label} symlink: {current}")
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
        "Dry-run production adapter could not materialize declared outputs: "
        f"{detail}. No source, graded, render, or deliverable files were deleted."
    )


def _validate_result(result: DryRunProductionAdapterResult) -> None:
    if not isinstance(result, DryRunProductionAdapterResult):
        raise DryRunProductionError("dry-run production adapter returned an invalid result")
    if not isinstance(result.job_id, str) or not result.job_id.strip():
        raise DryRunProductionError("dry-run production result job_id cannot be empty")
    if not isinstance(result.claimed_status, ProductionJobStatus):
        raise DryRunProductionError("dry-run production result claimed_status is invalid")
    if not isinstance(result.final_status, ProductionJobStatus):
        raise DryRunProductionError("dry-run production result final_status is invalid")
    if not isinstance(result.manifest, ProductionStatusManifest):
        raise DryRunProductionError("dry-run production result manifest is invalid")
    if not isinstance(result.outputs_materialized, tuple):
        raise DryRunProductionError("dry-run production result outputs_materialized must be a tuple")
    for output in result.outputs_materialized:
        _validate_production_output_path(output)
