from __future__ import annotations

import functools
import hashlib
import json
import os
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from shootflow.assembly import AssemblyPlan, RenderTask
from shootflow.ffmpeg_media import (
    FfmpegMediaError,
    encode_new_output,
    encode_new_outputs,
    feed_image_command,
    find_ffmpeg_tools,
    reel_command,
    require_workspace_file,
)
from shootflow.render_status import (
    RenderStatusError,
    RenderStatusManifest,
    RenderTaskStatus,
    compare_and_write_render_task_status,
    load_render_status_manifest,
)
from shootflow.render_worker import (
    RenderWorkerAction,
    RenderWorkerActionPlan,
    RenderWorkerError,
    claim_render_worker_action,
    report_render_worker_retryable,
    report_render_worker_success,
)
from shootflow.story import STORYLINE_ARTIFACT_PATH

_DRY_RUN_RENDERER_ADAPTER = "dry-run-local"
_FFMPEG_RENDERER_ADAPTER = "ffmpeg-local"


class DryRunRendererError(ValueError):
    """Raised when the dry-run renderer cannot safely materialize declared outputs."""


@dataclass(frozen=True)
class DryRunRenderResult:
    task_id: str
    claimed_status: RenderTaskStatus
    final_status: RenderTaskStatus
    manifest: RenderStatusManifest
    outputs_materialized: tuple[str, ...]


@dataclass(frozen=True)
class DryRunRenderFailure:
    task_id: str
    error_message: str


@dataclass(frozen=True)
class DryRunRenderBatchResult:
    shoot_slug: str
    renderer_adapter: str
    max_concurrency: int
    results: tuple[DryRunRenderResult, ...]
    failures: tuple[DryRunRenderFailure, ...]
    blocked_task_ids: tuple[str, ...]


class RenderBatchRunner(Protocol):
    def __call__(
        self,
        workspace_root: Path | str,
        *,
        trusted_plan: AssemblyPlan,
        action_plan: RenderWorkerActionPlan,
        started_at: str,
        completed_at: str,
        max_concurrency: int,
    ) -> DryRunRenderBatchResult:
        """Run a trusted render action plan for one registered adapter."""


def supported_render_adapter_names() -> tuple[str, ...]:
    """Return renderer adapter names that this build can execute locally."""

    return tuple(_render_adapter_registry())


def run_render_adapter_batch(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
    action_plan: RenderWorkerActionPlan,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
) -> DryRunRenderBatchResult:
    """Dispatch a trusted render action plan to its registered local adapter.

    The registry is the explicit execution boundary between scheduler/status
    orchestration and renderer-specific implementations. Unknown adapters fail
    before any worker action is claimed or output path is materialized.
    """

    _validate_action_plan(action_plan, trusted_plan=trusted_plan)
    runner = _render_batch_runner(action_plan.renderer_adapter)
    result = runner(
        workspace_root,
        trusted_plan=trusted_plan,
        action_plan=action_plan,
        started_at=started_at,
        completed_at=completed_at,
        max_concurrency=max_concurrency,
    )
    _validate_batch_result(result)
    return result


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

    return _run_render_action(
        workspace_root,
        trusted_plan=trusted_plan,
        action=action,
        started_at=started_at,
        completed_at=completed_at,
        expected_renderer_adapter=_DRY_RUN_RENDERER_ADAPTER,
        materialize_outputs=materialize_dry_run_render_outputs,
        renderer_label="Dry-run renderer",
    )


def run_ffmpeg_render_action(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
    action: RenderWorkerAction,
    started_at: str,
    completed_at: str,
) -> DryRunRenderResult:
    """Render one trusted task into real Instagram media with ffmpeg.

    Reels become 1080x1920 H.264 MP4s cut from the selected graded clips and
    photos; carousel and photo-set tasks become one 1080x1350 JPEG per graded
    input. Inputs are read only, and an existing output is never overwritten.
    """

    return _run_render_action(
        workspace_root,
        trusted_plan=trusted_plan,
        action=action,
        started_at=started_at,
        completed_at=completed_at,
        expected_renderer_adapter=_FFMPEG_RENDERER_ADAPTER,
        materialize_outputs=materialize_ffmpeg_render_outputs,
        renderer_label="ffmpeg renderer",
    )


def _run_render_action(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
    action: RenderWorkerAction,
    started_at: str,
    completed_at: str,
    expected_renderer_adapter: str,
    materialize_outputs,
    renderer_label: str,
) -> DryRunRenderResult:
    _validate_action(action, expected_renderer_adapter=expected_renderer_adapter)
    _validate_action_matches_trusted_plan(action, trusted_plan=trusted_plan)
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
        outputs_materialized = materialize_outputs(action, root)
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
            error_message=_retryable_error_message(exc, renderer_label=renderer_label),
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


def run_dry_run_render_batch(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
    action_plan: RenderWorkerActionPlan,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
) -> DryRunRenderBatchResult:
    """Run a trusted dry-run action plan while respecting per-task parallelism.

    This helper is a local scheduler convenience, not a new trust boundary. It
    executes only actions already emitted by ``plan_render_worker_actions`` and
    leaves blocked tasks untouched for the caller/UI to display.
    """

    return _run_render_batch(
        workspace_root,
        trusted_plan=trusted_plan,
        action_plan=action_plan,
        started_at=started_at,
        completed_at=completed_at,
        max_concurrency=max_concurrency,
        expected_renderer_adapter=_DRY_RUN_RENDERER_ADAPTER,
        run_action=run_dry_run_render_action,
    )


def run_ffmpeg_render_batch(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
    action_plan: RenderWorkerActionPlan,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
) -> DryRunRenderBatchResult:
    """Run a trusted ffmpeg action plan, one ffmpeg process per parallel task."""

    return _run_render_batch(
        workspace_root,
        trusted_plan=trusted_plan,
        action_plan=action_plan,
        started_at=started_at,
        completed_at=completed_at,
        max_concurrency=max_concurrency,
        expected_renderer_adapter=_FFMPEG_RENDERER_ADAPTER,
        run_action=run_ffmpeg_render_action,
    )


def _run_render_batch(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
    action_plan: RenderWorkerActionPlan,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
    expected_renderer_adapter: str,
    run_action,
) -> DryRunRenderBatchResult:
    _validate_action_plan(
        action_plan,
        trusted_plan=trusted_plan,
        expected_renderer_adapter=expected_renderer_adapter,
    )
    _validate_timestamp(started_at, "started_at")
    _validate_timestamp(completed_at, "completed_at")
    _validate_max_concurrency(max_concurrency)

    ordered_results: dict[int, DryRunRenderResult] = {}
    ordered_failures: dict[int, DryRunRenderFailure] = {}
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

    batch_result = DryRunRenderBatchResult(
        shoot_slug=action_plan.shoot_slug,
        renderer_adapter=action_plan.renderer_adapter,
        max_concurrency=max_concurrency,
        results=tuple(ordered_results[index] for index in sorted(ordered_results)),
        failures=tuple(ordered_failures[index] for index in sorted(ordered_failures)),
        blocked_task_ids=tuple(blocked.task_id for blocked in action_plan.blocked_tasks),
    )
    _validate_batch_result(batch_result)
    return batch_result


def materialize_dry_run_render_outputs(
    action: RenderWorkerAction,
    workspace_root: Path | str,
) -> tuple[str, ...]:
    """Create deterministic placeholder deliverables for a trusted render action."""

    _validate_action(action, expected_renderer_adapter=_DRY_RUN_RENDERER_ADAPTER)
    root = _workspace_root(workspace_root)
    materialized: list[str] = []
    for output in action.outputs:
        _write_dry_run_output(root, action=action, output=output)
        materialized.append(output)
    return tuple(materialized)


def materialize_ffmpeg_render_outputs(
    action: RenderWorkerAction,
    workspace_root: Path | str,
) -> tuple[str, ...]:
    """Encode the declared deliverables for one trusted render action."""

    _validate_action(action, expected_renderer_adapter=_FFMPEG_RENDERER_ADAPTER)
    root = _workspace_root(workspace_root)
    if not action.inputs or action.inputs[0] != STORYLINE_ARTIFACT_PATH:
        raise DryRunRendererError(
            f"ffmpeg render action must list {STORYLINE_ARTIFACT_PATH} as its first input: {action.task_id}"
        )
    media_inputs = action.inputs[1:]
    if not media_inputs:
        raise DryRunRendererError(f"ffmpeg render action has no graded media inputs: {action.task_id}")
    for output in action.outputs:
        _reject_symlink_path(_workspace_deliverable_path(root, output), root, "ffmpeg output")
    try:
        sources = tuple(
            require_workspace_file(root, input_ref, label="graded render input") for input_ref in media_inputs
        )
        tools = find_ffmpeg_tools()
        if action.sequence_name == "reel":
            if len(action.outputs) != 1 or not action.outputs[0].endswith(".mp4"):
                raise DryRunRendererError(f"ffmpeg reel action must declare one .mp4 output: {action.task_id}")
            encode_new_output(
                root,
                action.outputs[0],
                build_command=lambda temp_path: reel_command(tools, sources, temp_path),
            )
            return action.outputs
        if len(action.outputs) != len(sources):
            raise DryRunRendererError(
                f"ffmpeg image action must declare one output per graded input: {action.task_id}"
            )
        for output in action.outputs:
            if not output.endswith(".jpg"):
                raise DryRunRendererError(f"ffmpeg image output must be a .jpg file: {output}")
        encode_new_outputs(
            root,
            tuple(
                (output, functools.partial(feed_image_command, tools, source))
                for source, output in zip(sources, action.outputs, strict=True)
            ),
        )
    except FfmpegMediaError as exc:
        raise DryRunRendererError(str(exc)) from exc
    return action.outputs


def _validate_action(
    action: RenderWorkerAction,
    *,
    expected_renderer_adapter: str | None = None,
) -> None:
    if not isinstance(action, RenderWorkerAction):
        raise DryRunRendererError("action must be a RenderWorkerAction")
    if not isinstance(action.renderer_adapter, str) or not action.renderer_adapter.strip():
        raise DryRunRendererError("dry-run render action renderer_adapter cannot be empty")
    if (
        expected_renderer_adapter is not None
        and action.renderer_adapter != expected_renderer_adapter
    ):
        raise DryRunRendererError(
            "dry-run render action renderer_adapter must be "
            f"{expected_renderer_adapter}: {action.renderer_adapter}"
        )
    if not isinstance(action.outputs, tuple) or not action.outputs:
        raise DryRunRendererError("dry-run render action must declare at least one output")
    seen_outputs: set[str] = set()
    for output in action.outputs:
        _validate_deliverable_output_path(output)
        if output in seen_outputs:
            raise DryRunRendererError(f"dry-run render action has duplicate output: {output}")
        seen_outputs.add(output)


def _validate_action_plan(
    action_plan: RenderWorkerActionPlan,
    *,
    trusted_plan: AssemblyPlan,
    expected_renderer_adapter: str | None = None,
) -> None:
    if not isinstance(trusted_plan, AssemblyPlan):
        raise DryRunRendererError("trusted_plan must be an AssemblyPlan")
    if not isinstance(action_plan, RenderWorkerActionPlan):
        raise DryRunRendererError("action_plan must be a RenderWorkerActionPlan")
    if not isinstance(action_plan.shoot_slug, str) or not action_plan.shoot_slug.strip():
        raise DryRunRendererError("dry-run action plan shoot_slug cannot be empty")
    if action_plan.shoot_slug != trusted_plan.shoot_slug:
        raise DryRunRendererError("dry-run action plan shoot_slug does not match trusted plan")
    if not isinstance(action_plan.renderer_adapter, str) or not action_plan.renderer_adapter.strip():
        raise DryRunRendererError("dry-run action plan renderer_adapter cannot be empty")
    if (
        expected_renderer_adapter is not None
        and action_plan.renderer_adapter != expected_renderer_adapter
    ):
        raise DryRunRendererError(
            "dry-run action plan renderer_adapter must be "
            f"{expected_renderer_adapter}: {action_plan.renderer_adapter}"
        )
    if not isinstance(action_plan.actions, tuple):
        raise DryRunRendererError("dry-run action plan actions must be a tuple")
    if not isinstance(action_plan.blocked_tasks, tuple):
        raise DryRunRendererError("dry-run action plan blocked_tasks must be a tuple")
    trusted_tasks = _trusted_tasks_by_id(trusted_plan)
    seen_task_ids: set[str] = set()
    for action in action_plan.actions:
        _validate_action(action, expected_renderer_adapter=expected_renderer_adapter)
        _validate_action_matches_trusted_tasks(action, trusted_tasks=trusted_tasks)
        if action.renderer_adapter != action_plan.renderer_adapter:
            raise DryRunRendererError("dry-run action renderer adapter does not match action plan")
        if action.task_id in seen_task_ids:
            raise DryRunRendererError(f"dry-run action plan has duplicate action: {action.task_id}")
        seen_task_ids.add(action.task_id)
    for blocked_task in action_plan.blocked_tasks:
        if not isinstance(blocked_task.task_id, str) or not blocked_task.task_id.strip():
            raise DryRunRendererError("dry-run action plan blocked task_id cannot be empty")
        if blocked_task.task_id not in trusted_tasks:
            raise DryRunRendererError(f"dry-run action plan blocked unknown task: {blocked_task.task_id}")


def _validate_action_matches_trusted_plan(
    action: RenderWorkerAction,
    *,
    trusted_plan: AssemblyPlan,
) -> None:
    if not isinstance(trusted_plan, AssemblyPlan):
        raise DryRunRendererError("trusted_plan must be an AssemblyPlan")
    _validate_action_matches_trusted_tasks(action, trusted_tasks=_trusted_tasks_by_id(trusted_plan))


def _trusted_tasks_by_id(trusted_plan: AssemblyPlan) -> dict[str, RenderTask]:
    return {task.task_id: task for task in trusted_plan.render_tasks}


def _validate_action_matches_trusted_tasks(
    action: RenderWorkerAction,
    *,
    trusted_tasks: dict[str, RenderTask],
) -> None:
    trusted_task = trusted_tasks.get(action.task_id)
    if trusted_task is None:
        raise DryRunRendererError(f"dry-run action references unknown trusted task: {action.task_id}")
    expected_fields = (
        "sequence_name",
        "source_job_id",
        "output_kind",
        "aspect_ratio",
        "inputs",
        "outputs",
        "depends_on",
        "can_run_in_parallel",
    )
    for field_name in expected_fields:
        if getattr(action, field_name) != getattr(trusted_task, field_name):
            raise DryRunRendererError(
                f"dry-run action {field_name} does not match trusted task: {action.task_id}"
            )


def _validate_max_concurrency(max_concurrency: int) -> None:
    if (
        isinstance(max_concurrency, bool)
        or not isinstance(max_concurrency, int)
        or max_concurrency < 1
    ):
        raise DryRunRendererError("dry-run batch max_concurrency must be a positive integer")


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


def _retryable_error_message(exc: Exception, *, renderer_label: str = "Dry-run renderer") -> str:
    detail = str(exc).strip() or exc.__class__.__name__
    if len(detail) > 1500:
        detail = detail[:1497] + "..."
    return (
        f"{renderer_label} could not materialize declared outputs: "
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


def _run_batch_action(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
    action: RenderWorkerAction,
    started_at: str,
    completed_at: str,
    run_action,
) -> tuple[DryRunRenderResult | None, DryRunRenderFailure | None]:
    try:
        result = run_action(
            workspace_root,
            trusted_plan=trusted_plan,
            action=action,
            started_at=started_at,
            completed_at=completed_at,
        )
    except (DryRunRendererError, RenderWorkerError, RenderStatusError) as exc:
        return None, DryRunRenderFailure(
            task_id=action.task_id,
            error_message=_batch_failure_message(exc),
        )
    return result, None


def _batch_failure_message(exc: Exception) -> str:
    detail = str(exc).strip() or exc.__class__.__name__
    if len(detail) > 1500:
        detail = detail[:1497] + "..."
    return (
        "Dry-run batch scheduler could not execute action: "
        f"{detail}. No source, graded, or deliverable files were deleted."
    )


def _render_adapter_registry() -> dict[str, RenderBatchRunner]:
    return {
        _DRY_RUN_RENDERER_ADAPTER: run_dry_run_render_batch,
        _FFMPEG_RENDERER_ADAPTER: run_ffmpeg_render_batch,
    }


def _render_batch_runner(renderer_adapter: str) -> RenderBatchRunner:
    if not isinstance(renderer_adapter, str) or not renderer_adapter.strip():
        raise DryRunRendererError("renderer_adapter cannot be empty")
    registry = _render_adapter_registry()
    try:
        return registry[renderer_adapter]
    except KeyError as exc:
        supported_adapters = ", ".join(registry) or "none"
        raise DryRunRendererError(
            f"Unsupported renderer adapter: {renderer_adapter}. "
            f"Supported adapters: {supported_adapters}"
        ) from exc


def _validate_batch_result(result: DryRunRenderBatchResult) -> None:
    if not isinstance(result, DryRunRenderBatchResult):
        raise DryRunRendererError("dry-run batch result is invalid")
    if not isinstance(result.shoot_slug, str) or not result.shoot_slug.strip():
        raise DryRunRendererError("dry-run batch result shoot_slug cannot be empty")
    if not isinstance(result.renderer_adapter, str) or not result.renderer_adapter.strip():
        raise DryRunRendererError("dry-run batch result renderer_adapter cannot be empty")
    _validate_max_concurrency(result.max_concurrency)
    if not isinstance(result.results, tuple):
        raise DryRunRendererError("dry-run batch results must be a tuple")
    if not isinstance(result.failures, tuple):
        raise DryRunRendererError("dry-run batch failures must be a tuple")
    if not isinstance(result.blocked_task_ids, tuple):
        raise DryRunRendererError("dry-run batch blocked_task_ids must be a tuple")
    for action_result in result.results:
        _validate_result(action_result)
    for failure in result.failures:
        if not isinstance(failure, DryRunRenderFailure):
            raise DryRunRendererError("dry-run batch failure is invalid")
        if not isinstance(failure.task_id, str) or not failure.task_id.strip():
            raise DryRunRendererError("dry-run batch failure task_id cannot be empty")
        if not isinstance(failure.error_message, str) or not failure.error_message.strip():
            raise DryRunRendererError("dry-run batch failure error_message cannot be empty")
    for task_id in result.blocked_task_ids:
        if not isinstance(task_id, str) or not task_id.strip():
            raise DryRunRendererError("dry-run batch blocked task_id cannot be empty")
