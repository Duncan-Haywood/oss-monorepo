from __future__ import annotations

import hashlib
import json
import os
import stat
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from shootflow.production import ProductionJob, ProductionPlan
from shootflow.production_status import (
    ProductionJobStatus,
    ProductionStatusError,
    ProductionStatusManifest,
    compare_and_write_production_job_status,
    load_production_status_manifest,
)
from shootflow.production_worker import (
    ProductionWorkerAction,
    ProductionWorkerActionPlan,
    ProductionWorkerError,
    claim_production_worker_action,
    report_production_worker_retryable,
    report_production_worker_success,
)

_DRY_RUN_PRODUCTION_ADAPTER = "dry-run-production-local"
_METADATA_PRODUCTION_ADAPTER = "metadata-production-local"


class DryRunProductionError(ValueError):
    """Raised when the dry-run production adapter cannot safely run a job."""


@dataclass(frozen=True)
class DryRunProductionAdapterResult:
    job_id: str
    claimed_status: ProductionJobStatus
    final_status: ProductionJobStatus
    manifest: ProductionStatusManifest
    outputs_materialized: tuple[str, ...]


@dataclass(frozen=True)
class MetadataProductionAdapterResult(DryRunProductionAdapterResult):
    """Result from the local metadata adapter.

    It intentionally shares the dry-run result shape so scheduler reports and
    status transitions remain adapter-neutral while a real local worker proves
    input-reading behavior.
    """


@dataclass(frozen=True)
class DryRunProductionFailure:
    job_id: str
    error_message: str


@dataclass(frozen=True)
class DryRunProductionBatchResult:
    shoot_slug: str
    worker_adapter: str
    max_concurrency: int
    results: tuple[DryRunProductionAdapterResult, ...]
    failures: tuple[DryRunProductionFailure, ...]
    blocked_job_ids: tuple[str, ...]


def supported_production_adapter_names() -> tuple[str, ...]:
    """Return production adapter names that this build can execute locally."""

    return (_DRY_RUN_PRODUCTION_ADAPTER, _METADATA_PRODUCTION_ADAPTER)


def run_production_adapter_batch(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action_plan: ProductionWorkerActionPlan,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
) -> DryRunProductionBatchResult:
    """Run a supported production adapter batch by explicit adapter name."""

    if not isinstance(action_plan, ProductionWorkerActionPlan):
        raise DryRunProductionError("action_plan must be a ProductionWorkerActionPlan")
    if action_plan.worker_adapter == _DRY_RUN_PRODUCTION_ADAPTER:
        return run_dry_run_production_batch(
            workspace_root,
            trusted_plan=trusted_plan,
            action_plan=action_plan,
            started_at=started_at,
            completed_at=completed_at,
            max_concurrency=max_concurrency,
        )
    if action_plan.worker_adapter == _METADATA_PRODUCTION_ADAPTER:
        return run_metadata_production_batch(
            workspace_root,
            trusted_plan=trusted_plan,
            action_plan=action_plan,
            started_at=started_at,
            completed_at=completed_at,
            max_concurrency=max_concurrency,
        )
    supported_adapters = ", ".join(supported_production_adapter_names())
    raise DryRunProductionError(
        f"Unsupported production adapter: {action_plan.worker_adapter}. "
        f"Supported adapters: {supported_adapters}"
    )


def run_dry_run_production_batch(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action_plan: ProductionWorkerActionPlan,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
) -> DryRunProductionBatchResult:
    """Run trusted dry-run production actions while respecting per-job parallelism."""

    return _run_adapter_batch(
        workspace_root,
        trusted_plan=trusted_plan,
        action_plan=action_plan,
        started_at=started_at,
        completed_at=completed_at,
        max_concurrency=max_concurrency,
        expected_adapter=_DRY_RUN_PRODUCTION_ADAPTER,
        run_action=run_dry_run_production_action,
    )


def run_metadata_production_batch(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action_plan: ProductionWorkerActionPlan,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
) -> DryRunProductionBatchResult:
    """Run trusted metadata production actions while respecting parallelism."""

    return _run_adapter_batch(
        workspace_root,
        trusted_plan=trusted_plan,
        action_plan=action_plan,
        started_at=started_at,
        completed_at=completed_at,
        max_concurrency=max_concurrency,
        expected_adapter=_METADATA_PRODUCTION_ADAPTER,
        run_action=run_metadata_production_action,
    )


def _run_adapter_batch(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action_plan: ProductionWorkerActionPlan,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
    expected_adapter: str,
    run_action,
) -> DryRunProductionBatchResult:
    _validate_action_plan(
        action_plan,
        trusted_plan=trusted_plan,
        expected_adapter=expected_adapter,
    )
    _validate_timestamp(started_at, "started_at")
    _validate_timestamp(completed_at, "completed_at")
    _validate_max_concurrency(max_concurrency)

    ordered_results: dict[int, DryRunProductionAdapterResult] = {}
    ordered_failures: dict[int, DryRunProductionFailure] = {}
    action_index = 0
    actions = action_plan.actions

    while action_index < len(actions):
        current_action = actions[action_index]
        if not current_action.can_run_in_parallel or max_concurrency == 1:
            result, failure = _run_batch_action(
                workspace_root,
                trusted_plan=trusted_plan,
                action=current_action,
                started_at=started_at,
                completed_at=completed_at,
                run_action=run_action,
            )
            if result is not None:
                ordered_results[action_index] = result
            if failure is not None:
                ordered_failures[action_index] = failure
            action_index += 1
            continue

        group_start = action_index
        group_end = group_start
        while group_end < len(actions) and actions[group_end].can_run_in_parallel:
            group_end += 1
        with ThreadPoolExecutor(max_workers=max_concurrency) as executor:
            futures = {
                executor.submit(
                    _run_batch_action,
                    workspace_root,
                    trusted_plan=trusted_plan,
                    action=action,
                    started_at=started_at,
                    completed_at=completed_at,
                    run_action=run_action,
                ): index
                for index, action in enumerate(actions[group_start:group_end], start=group_start)
            }
            for future in as_completed(futures):
                index = futures[future]
                result, failure = future.result()
                if result is not None:
                    ordered_results[index] = result
                if failure is not None:
                    ordered_failures[index] = failure
        action_index = group_end

    batch_result = DryRunProductionBatchResult(
        shoot_slug=action_plan.shoot_slug,
        worker_adapter=action_plan.worker_adapter,
        max_concurrency=max_concurrency,
        results=tuple(ordered_results[index] for index in sorted(ordered_results)),
        failures=tuple(ordered_failures[index] for index in sorted(ordered_failures)),
        blocked_job_ids=tuple(blocked.job_id for blocked in action_plan.blocked_jobs),
    )
    _validate_batch_result(batch_result)
    return batch_result


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

    return _run_production_action(
        workspace_root,
        trusted_plan=trusted_plan,
        action=action,
        started_at=started_at,
        completed_at=completed_at,
        expected_adapter=_DRY_RUN_PRODUCTION_ADAPTER,
        materialize_outputs=_materialize_dry_run_production_outputs,
        retryable_error_message=_retryable_error_message,
        result_type=DryRunProductionAdapterResult,
    )


def run_metadata_production_action(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action: ProductionWorkerAction,
    started_at: str,
    completed_at: str,
) -> MetadataProductionAdapterResult:
    """Persist one trusted metadata action through claim, output JSON, and result."""

    return _run_production_action(
        workspace_root,
        trusted_plan=trusted_plan,
        action=action,
        started_at=started_at,
        completed_at=completed_at,
        expected_adapter=_METADATA_PRODUCTION_ADAPTER,
        materialize_outputs=_materialize_metadata_production_outputs,
        retryable_error_message=_metadata_retryable_error_message,
        result_type=MetadataProductionAdapterResult,
    )


def _run_production_action(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action: ProductionWorkerAction,
    started_at: str,
    completed_at: str,
    expected_adapter: str,
    materialize_outputs,
    retryable_error_message,
    result_type,
) -> DryRunProductionAdapterResult:
    _validate_action(action, expected_adapter=expected_adapter)
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
        outputs_materialized = materialize_outputs(action, root)
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
            error_message=retryable_error_message(exc),
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
    result = result_type(
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


def _materialize_metadata_production_outputs(
    action: ProductionWorkerAction,
    workspace_root: Path | str,
) -> tuple[str, ...]:
    """Create deterministic metadata JSON from trusted workspace inputs."""

    _validate_action(action, expected_adapter=_METADATA_PRODUCTION_ADAPTER)
    root = _workspace_root(workspace_root)
    input_metadata = _metadata_for_inputs(root, action.inputs)
    materialized: list[str] = []
    for output in action.outputs:
        _write_metadata_output(root, action=action, output=output, input_metadata=input_metadata)
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


def _validate_action_plan(
    action_plan: ProductionWorkerActionPlan,
    *,
    trusted_plan: ProductionPlan,
    expected_adapter: str | None = None,
) -> None:
    if not isinstance(trusted_plan, ProductionPlan):
        raise DryRunProductionError("trusted_plan must be a ProductionPlan")
    if not isinstance(action_plan, ProductionWorkerActionPlan):
        raise DryRunProductionError("action_plan must be a ProductionWorkerActionPlan")
    if not isinstance(action_plan.shoot_slug, str) or not action_plan.shoot_slug.strip():
        raise DryRunProductionError("dry-run production action plan shoot_slug cannot be empty")
    if action_plan.shoot_slug != trusted_plan.shoot_slug:
        raise DryRunProductionError("dry-run production action plan shoot_slug does not match trusted plan")
    if not isinstance(action_plan.worker_adapter, str) or not action_plan.worker_adapter.strip():
        raise DryRunProductionError("dry-run production action plan worker_adapter cannot be empty")
    if expected_adapter is not None and action_plan.worker_adapter != expected_adapter:
        raise DryRunProductionError(
            "dry-run production action plan worker_adapter must be "
            f"{expected_adapter}: {action_plan.worker_adapter}"
        )
    if not isinstance(action_plan.actions, tuple):
        raise DryRunProductionError("dry-run production action plan actions must be a tuple")
    if not isinstance(action_plan.blocked_jobs, tuple):
        raise DryRunProductionError("dry-run production action plan blocked_jobs must be a tuple")

    trusted_jobs = {job.job_id: job for job in trusted_plan.jobs}
    seen_job_ids: set[str] = set()
    for action in action_plan.actions:
        _validate_action(action, expected_adapter=expected_adapter)
        _validate_action_matches_trusted_plan(action, trusted_plan=trusted_plan)
        if action.worker_adapter != action_plan.worker_adapter:
            raise DryRunProductionError("dry-run production action adapter does not match action plan")
        if action.job_id in seen_job_ids:
            raise DryRunProductionError(f"dry-run production action plan has duplicate action: {action.job_id}")
        seen_job_ids.add(action.job_id)
    for blocked_job in action_plan.blocked_jobs:
        if not isinstance(blocked_job.job_id, str) or not blocked_job.job_id.strip():
            raise DryRunProductionError("dry-run production action plan blocked job_id cannot be empty")
        if blocked_job.job_id not in trusted_jobs:
            raise DryRunProductionError(
                f"dry-run production action plan blocked unknown job: {blocked_job.job_id}"
            )


def _validate_max_concurrency(max_concurrency: int) -> None:
    if (
        isinstance(max_concurrency, bool)
        or not isinstance(max_concurrency, int)
        or max_concurrency < 1
    ):
        raise DryRunProductionError("dry-run production batch max_concurrency must be a positive integer")


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
    _write_production_output_bytes(root, output=output, content=content, label="dry-run production")


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


def _write_metadata_output(
    root: Path,
    *,
    action: ProductionWorkerAction,
    output: str,
    input_metadata: tuple[dict[str, object], ...],
) -> None:
    if output.endswith("/"):
        raise DryRunProductionError(
            "Metadata production adapter does not materialize directory-style output: "
            f"{output}"
        )
    content = _metadata_output_bytes(action, output=output, input_metadata=input_metadata)
    _write_production_output_bytes(root, output=output, content=content, label="metadata production")


def _write_production_output_bytes(
    root: Path,
    *,
    output: str,
    content: bytes,
    label: str,
) -> None:
    expected_sha256 = hashlib.sha256(content).hexdigest()
    output_path = _workspace_output_path(root, output)

    _reject_symlink_path(output_path.parent, root, f"{label} output directory")
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise DryRunProductionError(
            f"Unable to create {label} output directory: {output_path.parent}"
        ) from exc
    _reject_symlink_path(output_path.parent, root, f"{label} output directory")
    _reject_symlink_path(output_path, root, f"{label} output")

    if output_path.exists():
        _validate_existing_output(output_path, output=output, expected_sha256=expected_sha256)
        return

    temp_path = output_path.with_name(f".{output_path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    _reject_symlink_path(temp_path, root, f"temporary {label} output")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW

    try:
        fd = os.open(temp_path, flags, 0o600)
    except OSError as exc:
        raise DryRunProductionError(f"Unable to create temporary {label} output: {temp_path}") from exc

    try:
        with os.fdopen(fd, "wb") as temp_file:
            temp_file.write(content)
        _reject_symlink_path(temp_path, root, f"temporary {label} output")
        try:
            os.link(temp_path, output_path)
        except FileExistsError:
            _validate_existing_output(output_path, output=output, expected_sha256=expected_sha256)
        except OSError as exc:
            raise DryRunProductionError(f"Unable to commit {label} output: {output}") from exc
    except OSError as exc:
        raise DryRunProductionError(f"Unable to write {label} output: {output}") from exc
    finally:
        try:
            temp_path.unlink()
        except FileNotFoundError:
            pass


def _metadata_output_bytes(
    action: ProductionWorkerAction,
    *,
    output: str,
    input_metadata: tuple[dict[str, object], ...],
) -> bytes:
    payload = {
        "schema_version": 1,
        "adapter": "shootflow-metadata-production",
        "job_id": action.job_id,
        "output_kind": action.output_kind,
        "inputs": list(action.inputs),
        "input_metadata": list(input_metadata),
        "outputs": list(action.outputs),
        "selected_output": output,
        "depends_on": list(action.depends_on),
        "can_run_in_parallel": action.can_run_in_parallel,
    }
    return (json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _metadata_for_inputs(root: Path, inputs: tuple[str, ...]) -> tuple[dict[str, object], ...]:
    return tuple(_metadata_for_input(root, input_ref) for input_ref in inputs)


def _metadata_for_input(root: Path, input_ref: str) -> dict[str, object]:
    input_path = _workspace_input_path(root, input_ref)
    _reject_symlink_path(input_path.parent, root, "metadata production input directory")
    _reject_symlink_path(input_path, root, "metadata production input")
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW

    try:
        fd = os.open(input_path, flags)
    except FileNotFoundError as exc:
        raise DryRunProductionError(f"Missing metadata production input: {input_ref}") from exc
    except OSError as exc:
        raise DryRunProductionError(f"Unable to open metadata production input: {input_ref}") from exc

    digest = hashlib.sha256()
    try:
        with os.fdopen(fd, "rb") as input_file:
            input_stat = os.fstat(input_file.fileno())
            if not stat.S_ISREG(input_stat.st_mode):
                raise DryRunProductionError(f"Refusing non-file metadata production input: {input_ref}")
            for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise DryRunProductionError(f"Unable to read metadata production input: {input_ref}") from exc

    return {
        "path": input_ref,
        "sha256": digest.hexdigest(),
        "size_bytes": input_stat.st_size,
    }


def _workspace_output_path(root: Path, output: str) -> Path:
    _validate_production_output_path(output)
    output_path = root / output
    try:
        output_path.relative_to(root)
    except ValueError as exc:
        raise DryRunProductionError(f"Dry-run production output escapes workspace: {output}") from exc
    return output_path


def _workspace_input_path(root: Path, input_ref: str) -> Path:
    _validate_production_input_path(input_ref)
    raw_input_path = Path(input_ref)
    root_absolute = root.absolute()
    if raw_input_path.is_absolute():
        input_path = raw_input_path
    elif _path_is_relative_to(raw_input_path.absolute(), root_absolute):
        input_path = raw_input_path.absolute()
    else:
        input_path = (root / raw_input_path).absolute()
    try:
        input_path.absolute().relative_to(root_absolute)
    except ValueError as exc:
        raise DryRunProductionError(f"Metadata production input escapes workspace: {input_ref}") from exc
    return input_path


def _validate_production_output_path(output: str) -> None:
    if not isinstance(output, str) or not output.strip():
        raise DryRunProductionError("dry-run production output path cannot be empty")
    if _contains_invalid_path_character(output):
        raise DryRunProductionError(f"Unsafe dry-run production output path: {output!r}")
    output_path = Path(output)
    if output_path.is_absolute() or ".." in output_path.parts:
        raise DryRunProductionError(f"Unsafe dry-run production output path: {output}")


def _validate_production_input_path(input_ref: str) -> None:
    if not isinstance(input_ref, str) or not input_ref.strip():
        raise DryRunProductionError("metadata production input path cannot be empty")
    if _contains_invalid_path_character(input_ref):
        raise DryRunProductionError(f"Unsafe metadata production input path: {input_ref!r}")
    input_path = Path(input_ref)
    if ".." in input_path.parts:
        raise DryRunProductionError(f"Unsafe metadata production input path: {input_ref}")


def _contains_invalid_path_character(value: str) -> bool:
    return "\x00" in value or "\n" in value or "\r" in value


def _path_is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


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


def _metadata_retryable_error_message(exc: Exception) -> str:
    detail = str(exc).strip() or exc.__class__.__name__
    if len(detail) > 1500:
        detail = detail[:1497] + "..."
    return (
        "Metadata production adapter could not materialize declared outputs: "
        f"{detail}. No source, analysis, graded, render, or deliverable files were deleted."
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


def _run_batch_action(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action: ProductionWorkerAction,
    started_at: str,
    completed_at: str,
    run_action,
) -> tuple[DryRunProductionAdapterResult | None, DryRunProductionFailure | None]:
    try:
        result = run_action(
            workspace_root,
            trusted_plan=trusted_plan,
            action=action,
            started_at=started_at,
            completed_at=completed_at,
        )
    except (DryRunProductionError, ProductionWorkerError, ProductionStatusError) as exc:
        return None, DryRunProductionFailure(
            job_id=action.job_id,
            error_message=_batch_failure_message(exc),
        )
    return result, None


def _batch_failure_message(exc: Exception) -> str:
    detail = str(exc).strip() or exc.__class__.__name__
    if len(detail) > 1500:
        detail = detail[:1497] + "..."
    return (
        "Dry-run production batch scheduler could not execute action: "
        f"{detail}. No source, graded, render, or deliverable files were deleted."
    )


def _validate_batch_result(result: DryRunProductionBatchResult) -> None:
    if not isinstance(result, DryRunProductionBatchResult):
        raise DryRunProductionError("dry-run production batch result is invalid")
    if not isinstance(result.shoot_slug, str) or not result.shoot_slug.strip():
        raise DryRunProductionError("dry-run production batch result shoot_slug cannot be empty")
    if not isinstance(result.worker_adapter, str) or not result.worker_adapter.strip():
        raise DryRunProductionError("dry-run production batch result worker_adapter cannot be empty")
    _validate_max_concurrency(result.max_concurrency)
    if not isinstance(result.results, tuple):
        raise DryRunProductionError("dry-run production batch results must be a tuple")
    if not isinstance(result.failures, tuple):
        raise DryRunProductionError("dry-run production batch failures must be a tuple")
    if not isinstance(result.blocked_job_ids, tuple):
        raise DryRunProductionError("dry-run production batch blocked_job_ids must be a tuple")
    for action_result in result.results:
        _validate_result(action_result)
    for failure in result.failures:
        if not isinstance(failure, DryRunProductionFailure):
            raise DryRunProductionError("dry-run production batch failure is invalid")
        if not isinstance(failure.job_id, str) or not failure.job_id.strip():
            raise DryRunProductionError("dry-run production batch failure job_id cannot be empty")
        if not isinstance(failure.error_message, str) or not failure.error_message.strip():
            raise DryRunProductionError("dry-run production batch failure error_message cannot be empty")
    for job_id in result.blocked_job_ids:
        if not isinstance(job_id, str) or not job_id.strip():
            raise DryRunProductionError("dry-run production batch blocked job_id cannot be empty")
