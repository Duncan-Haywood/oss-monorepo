from __future__ import annotations

import json
import os
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from shootflow.production import ProductionJob, ProductionPlan
from shootflow.story import ContentSequence, ReelVariant, STORYLINE_ARTIFACT_PATH, load_storyline_artifact

SequenceName = Literal["reel", "carousel", "photo_set"]
MediaKind = Literal["photo", "video"]
RENDER_TASKS_MANIFEST_PATH = "deliverables/render_tasks.json"
_RENDER_TASKS_SCHEMA_VERSION = 1
DEFAULT_PHOTO_SET_CHUNK_SIZE = 250

_SEQUENCE_ORDER: tuple[SequenceName, ...] = ("reel", "carousel", "photo_set")
_SEQUENCE_MEDIA: dict[SequenceName, MediaKind] = {
    "reel": "video",
    "carousel": "photo",
    "photo_set": "photo",
}
_SEQUENCE_JOB_IDS: dict[SequenceName, str] = {
    "reel": "assemble_instagram_reel",
    "carousel": "assemble_instagram_carousel",
    "photo_set": "export_instagram_photo_set",
}
_SEQUENCE_OUTPUT_KINDS: dict[SequenceName, str] = {
    "reel": "instagram_reel",
    "carousel": "instagram_carousel",
    "photo_set": "instagram_photo_set",
}
_SEQUENCE_ASPECT_RATIOS: dict[SequenceName, str] = {
    "reel": "9:16",
    "carousel": "4:5",
    "photo_set": "4:5",
}
_SEQUENCE_TASK_IDS: dict[SequenceName, str] = {
    "reel": "render_instagram_reel",
    "carousel": "render_instagram_carousel",
    "photo_set": "export_instagram_photo_set",
}
_SEQUENCE_CANONICAL_OUTPUTS: dict[SequenceName, str] = {
    "reel": "deliverables/instagram_reel.mp4",
    "carousel": "deliverables/instagram_carousel/",
    "photo_set": "deliverables/instagram_photo_set/",
}
_PHOTO_SET_CHUNK_TASK_PREFIX = "export_instagram_photo_set_part_"
_PHOTO_SET_CHUNK_TASK_PATTERN = re.compile(r"^export_instagram_photo_set_part_(\d{5})$")
_PHOTO_SET_OUTPUT_PATTERN = re.compile(r"^deliverables/instagram_photo_set/photo_(\d{5})\.jpg$")
_REEL_VARIANT_TASK_PREFIX = "render_instagram_reel_variant_"
_REEL_VARIANT_TASK_PATTERN = re.compile(r"^render_instagram_reel_variant_([a-z0-9][a-z0-9_]{0,63})$")
_REEL_VARIANT_OUTPUT_PATTERN = re.compile(r"^deliverables/instagram_reels/([a-z0-9][a-z0-9_]{0,63})\.mp4$")
_MANIFEST_KEYS = frozenset({"schema_version", "shoot_slug", "render_tasks"})
_TASK_KEYS = frozenset(
    {
        "task_id",
        "sequence_name",
        "source_job_id",
        "output_kind",
        "aspect_ratio",
        "inputs",
        "outputs",
        "depends_on",
        "can_run_in_parallel",
    }
)


class AssemblyPlanError(ValueError):
    """Raised when storyline selections cannot be assembled safely."""


@dataclass(frozen=True)
class RenderTask:
    task_id: str
    sequence_name: SequenceName
    source_job_id: str
    output_kind: str
    aspect_ratio: str
    inputs: tuple[str, ...]
    outputs: tuple[str, ...]
    depends_on: tuple[str, ...] = ()
    can_run_in_parallel: bool = False


@dataclass(frozen=True)
class AssemblyPlan:
    shoot_slug: str
    render_tasks: tuple[RenderTask, ...]


@dataclass(frozen=True)
class RenderTasksManifestWriteResult:
    manifest_path: Path
    created: bool


@dataclass(frozen=True)
class _GradedOutput:
    job_id: str
    media_kind: MediaKind


def build_assembly_plan(
    plan: ProductionPlan,
    workspace_root: Path | str,
    *,
    photo_set_chunk_size: int = DEFAULT_PHOTO_SET_CHUNK_SIZE,
) -> AssemblyPlan:
    if not isinstance(plan, ProductionPlan):
        raise TypeError("plan must be a ProductionPlan")
    _validate_photo_set_chunk_size(photo_set_chunk_size)
    root = Path(workspace_root)
    if root.is_symlink():
        raise AssemblyPlanError(f"Refusing assembly workspace symlink: {root}")

    graded_outputs = _graded_outputs_by_path(plan)
    storyline = load_storyline_artifact(root, allowed_asset_paths=frozenset(graded_outputs))
    deliverable_jobs = _deliverable_jobs_by_id(plan)

    render_tasks: list[RenderTask] = []
    for sequence_name in _SEQUENCE_ORDER:
        sequence = getattr(storyline, sequence_name)
        if sequence.asset_paths:
            _validate_sequence_media(sequence_name, sequence, graded_outputs=graded_outputs)
            _verify_selected_assets_exist(root, sequence.asset_paths)
            render_tasks.extend(
                _render_tasks_for_sequence(
                    sequence_name,
                    sequence,
                    photo_set_chunk_size=photo_set_chunk_size,
                    graded_outputs=graded_outputs,
                    deliverable_jobs=deliverable_jobs,
                )
            )
        if sequence_name == "reel":
            for variant in storyline.reel_variants:
                if not variant.sequence.asset_paths:
                    continue
                _validate_sequence_media("reel", variant.sequence, graded_outputs=graded_outputs)
                _verify_selected_assets_exist(root, variant.sequence.asset_paths)
                render_tasks.extend(
                    _render_tasks_for_reel_variant(
                        variant,
                        graded_outputs=graded_outputs,
                        deliverable_jobs=deliverable_jobs,
                    )
                )

    return AssemblyPlan(shoot_slug=plan.shoot_slug, render_tasks=tuple(render_tasks))


def validate_assembly_plan(plan: AssemblyPlan) -> None:
    if not isinstance(plan, AssemblyPlan):
        raise TypeError("plan must be an AssemblyPlan")
    _validate_assembly_plan(plan)


def write_render_tasks_manifest(plan: AssemblyPlan, workspace_root: Path | str) -> Path:
    return ensure_render_tasks_manifest(plan, workspace_root).manifest_path


def ensure_render_tasks_manifest(
    plan: AssemblyPlan,
    workspace_root: Path | str,
) -> RenderTasksManifestWriteResult:
    if not isinstance(plan, AssemblyPlan):
        raise TypeError("plan must be an AssemblyPlan")
    _validate_assembly_plan(plan)

    manifest_path = _render_tasks_manifest_path(workspace_root)
    root = Path(workspace_root)
    _reject_symlink_path(manifest_path.parent, root, "render task manifest directory")
    if manifest_path.exists() or manifest_path.is_symlink():
        try:
            load_render_tasks_manifest(root, trusted_plan=plan)
        except AssemblyPlanError as exc:
            raise AssemblyPlanError(
                "Refusing to overwrite existing render task manifest that does "
                f"not match trusted assembly plan: {manifest_path}"
            ) from exc
        return RenderTasksManifestWriteResult(manifest_path=manifest_path, created=False)
    try:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise AssemblyPlanError(
            f"Unable to create render task manifest directory: {manifest_path.parent}"
        ) from exc
    _reject_symlink_path(manifest_path.parent, root, "render task manifest directory")
    _reject_symlink_path(manifest_path, root, "render task manifest")

    manifest_json = _assembly_plan_json(plan)
    temp_path = manifest_path.with_suffix(".json.tmp")
    _reject_symlink_path(temp_path, root, "temporary render task manifest")
    _write_temporary_render_tasks_manifest(temp_path, manifest_json)
    try:
        os.link(temp_path, manifest_path)
    except FileExistsError:
        try:
            load_render_tasks_manifest(root, trusted_plan=plan)
        except AssemblyPlanError as load_exc:
            raise AssemblyPlanError(
                "Refusing to overwrite existing render task manifest that does "
                f"not match trusted assembly plan: {manifest_path}"
            ) from load_exc
        return RenderTasksManifestWriteResult(manifest_path=manifest_path, created=False)
    except OSError:
        created = _write_render_tasks_manifest_without_hardlink(
            manifest_path,
            root,
            plan,
            manifest_json,
        )
        return RenderTasksManifestWriteResult(manifest_path=manifest_path, created=created)
    finally:
        try:
            temp_path.unlink()
        except FileNotFoundError:
            pass
    return RenderTasksManifestWriteResult(manifest_path=manifest_path, created=True)


def _write_temporary_render_tasks_manifest(temp_path: Path, manifest_json: str) -> None:
    temp_created = False
    try:
        with temp_path.open("x", encoding="utf-8") as handle:
            temp_created = True
            handle.write(manifest_json)
    except FileExistsError as exc:
        raise AssemblyPlanError(
            f"Refusing existing temporary render task manifest: {temp_path}"
        ) from exc
    except OSError as exc:
        if temp_created:
            try:
                temp_path.unlink()
            except FileNotFoundError:
                pass
        raise AssemblyPlanError(
            f"Unable to write temporary render task manifest: {temp_path}"
        ) from exc


def _write_render_tasks_manifest_without_hardlink(
    manifest_path: Path,
    root: Path,
    plan: AssemblyPlan,
    manifest_json: str,
) -> bool:
    try:
        with manifest_path.open("x", encoding="utf-8") as handle:
            handle.write(manifest_json)
    except FileExistsError:
        try:
            load_render_tasks_manifest(root, trusted_plan=plan)
        except AssemblyPlanError as load_exc:
            raise AssemblyPlanError(
                "Refusing to overwrite existing render task manifest that does "
                f"not match trusted assembly plan: {manifest_path}"
            ) from load_exc
        return False
    except OSError as exc:
        try:
            manifest_path.unlink()
        except FileNotFoundError:
            pass
        raise AssemblyPlanError(
            f"Unable to create render task manifest without hard links: {manifest_path}"
        ) from exc
    return True


def load_render_tasks_manifest(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
) -> AssemblyPlan:
    if not isinstance(trusted_plan, AssemblyPlan):
        raise TypeError("trusted_plan must be an AssemblyPlan")
    _validate_assembly_plan(trusted_plan)

    manifest_path = _render_tasks_manifest_path(workspace_root)
    root = Path(workspace_root)
    _reject_symlink_path(manifest_path.parent, root, "render task manifest directory")
    _reject_symlink_path(manifest_path, root, "render task manifest")
    _reject_symlink_path(
        manifest_path.with_suffix(".json.tmp"),
        root,
        "temporary render task manifest",
    )
    loaded_plan = _assembly_plan_from_json(_read_json_object(manifest_path))
    _validate_assembly_plan(loaded_plan)
    if loaded_plan != trusted_plan:
        raise AssemblyPlanError("Render task manifest does not match trusted assembly plan")
    return loaded_plan


def load_trusted_render_tasks_manifest(workspace_root: Path | str) -> AssemblyPlan:
    """Load the persisted render-task handoff as the trusted plan for worker CLIs.

    This is intended for background agents that start from the strict
    ``deliverables/render_tasks.json`` handoff rather than an in-memory
    ``ProductionPlan``. The file still receives the same schema, path, and
    canonical task validation before callers may use it as authority.
    """

    manifest_path = _render_tasks_manifest_path(workspace_root)
    root = Path(workspace_root)
    _reject_symlink_path(manifest_path.parent, root, "render task manifest directory")
    _reject_symlink_path(manifest_path, root, "render task manifest")
    _reject_symlink_path(
        manifest_path.with_suffix(".json.tmp"),
        root,
        "temporary render task manifest",
    )
    loaded_plan = _assembly_plan_from_json(_read_json_object(manifest_path))
    _validate_assembly_plan(loaded_plan)
    _verify_persisted_render_task_inputs(root, loaded_plan)
    return loaded_plan


def _verify_persisted_render_task_inputs(root: Path, plan: AssemblyPlan) -> None:
    for task in plan.render_tasks:
        for input_path in task.inputs:
            path = _safe_workspace_path(root, input_path)
            _reject_symlink_path(path, root, "render task input")
            if not path.exists():
                raise AssemblyPlanError(f"Missing render task input: {input_path}")
            if not path.is_file():
                raise AssemblyPlanError(f"Render task input must be a file: {input_path}")


def _graded_outputs_by_path(plan: ProductionPlan) -> dict[str, _GradedOutput]:
    outputs: dict[str, _GradedOutput] = {}
    for job in plan.jobs:
        if not job.output_kind.startswith("graded_"):
            continue
        media_kind = _media_kind_from_output_kind(job.output_kind)
        output = _single_job_output(job)
        _validate_relative_artifact_path(output, expected_root="graded")
        if output in outputs:
            raise AssemblyPlanError(f"Duplicate graded output path: {output}")
        outputs[output] = _GradedOutput(job_id=job.job_id, media_kind=media_kind)
    return outputs


def _deliverable_jobs_by_id(plan: ProductionPlan) -> dict[str, ProductionJob]:
    return {
        job.job_id: job
        for job in plan.jobs
        if job.output_kind in {"instagram_reel", "instagram_carousel", "instagram_photo_set"}
    }


def _validate_sequence_media(
    sequence_name: SequenceName,
    sequence: ContentSequence,
    *,
    graded_outputs: dict[str, _GradedOutput],
) -> None:
    required_media = _SEQUENCE_MEDIA[sequence_name]
    for asset_path in sequence.asset_paths:
        graded_output = graded_outputs.get(asset_path)
        if graded_output is None or graded_output.media_kind != required_media:
            raise AssemblyPlanError(f"{sequence_name} requires {required_media} graded assets: {asset_path}")


def _verify_selected_assets_exist(root: Path, asset_paths: tuple[str, ...]) -> None:
    for asset_path in asset_paths:
        path = _safe_workspace_path(root, asset_path)
        _reject_symlink_path(path, root, "graded asset")
        if not path.is_file():
            raise AssemblyPlanError(f"Missing graded asset: {asset_path}")


def _render_tasks_for_sequence(
    sequence_name: SequenceName,
    sequence: ContentSequence,
    *,
    photo_set_chunk_size: int,
    graded_outputs: dict[str, _GradedOutput],
    deliverable_jobs: dict[str, ProductionJob],
) -> tuple[RenderTask, ...]:
    if sequence_name != "photo_set" or len(sequence.asset_paths) <= photo_set_chunk_size:
        return (
            _render_task_for_sequence_chunk(
                sequence_name,
                sequence,
                chunk_asset_paths=sequence.asset_paths,
                start_index=1,
                chunk_number=None,
                can_run_in_parallel=None,
                graded_outputs=graded_outputs,
                deliverable_jobs=deliverable_jobs,
            ),
        )

    tasks: list[RenderTask] = []
    for chunk_offset in range(0, len(sequence.asset_paths), photo_set_chunk_size):
        chunk_asset_paths = sequence.asset_paths[chunk_offset : chunk_offset + photo_set_chunk_size]
        tasks.append(
            _render_task_for_sequence_chunk(
                sequence_name,
                sequence,
                chunk_asset_paths=chunk_asset_paths,
                start_index=chunk_offset + 1,
                chunk_number=(chunk_offset // photo_set_chunk_size) + 1,
                can_run_in_parallel=True,
                graded_outputs=graded_outputs,
                deliverable_jobs=deliverable_jobs,
            )
        )
    return tuple(tasks)


def _render_tasks_for_reel_variant(
    variant: ReelVariant,
    *,
    graded_outputs: dict[str, _GradedOutput],
    deliverable_jobs: dict[str, ProductionJob],
) -> tuple[RenderTask, ...]:
    _validate_reel_variant_id(variant.variant_id)
    return (
        _render_task_for_sequence_chunk(
            "reel",
            variant.sequence,
            chunk_asset_paths=variant.sequence.asset_paths,
            start_index=1,
            chunk_number=None,
            variant_id=variant.variant_id,
            can_run_in_parallel=True,
            graded_outputs=graded_outputs,
            deliverable_jobs=deliverable_jobs,
        ),
    )


def _render_task_for_sequence_chunk(
    sequence_name: SequenceName,
    sequence: ContentSequence,
    *,
    chunk_asset_paths: tuple[str, ...],
    start_index: int,
    chunk_number: int | None,
    can_run_in_parallel: bool | None,
    graded_outputs: dict[str, _GradedOutput],
    deliverable_jobs: dict[str, ProductionJob],
    variant_id: str | None = None,
) -> RenderTask:
    source_job_id = _SEQUENCE_JOB_IDS[sequence_name]
    try:
        source_job = deliverable_jobs[source_job_id]
    except KeyError as exc:
        raise AssemblyPlanError(f"Missing deliverable job for sequence: {sequence_name}") from exc

    outputs = _outputs_for_sequence(
        sequence_name,
        source_job,
        item_count=len(chunk_asset_paths),
        start_index=start_index,
        variant_id=variant_id,
    )
    selected_dependencies = tuple(graded_outputs[asset_path].job_id for asset_path in chunk_asset_paths)
    return RenderTask(
        task_id=_render_task_id(sequence_name, chunk_number=chunk_number, variant_id=variant_id),
        sequence_name=sequence_name,
        source_job_id=source_job_id,
        output_kind=sequence.output_kind,
        aspect_ratio=sequence.aspect_ratio,
        inputs=(STORYLINE_ARTIFACT_PATH,) + chunk_asset_paths,
        outputs=outputs,
        depends_on=("rank_instagram_storylines",) + selected_dependencies,
        can_run_in_parallel=source_job.can_run_in_parallel
        if can_run_in_parallel is None
        else can_run_in_parallel,
    )


def _render_task_id(
    sequence_name: SequenceName,
    *,
    chunk_number: int | None,
    variant_id: str | None = None,
) -> str:
    if variant_id is not None:
        if sequence_name != "reel" or chunk_number is not None:
            raise AssemblyPlanError("Only reel render tasks can have variants")
        _validate_reel_variant_id(variant_id)
        return f"{_REEL_VARIANT_TASK_PREFIX}{variant_id}"
    if chunk_number is None:
        return _SEQUENCE_TASK_IDS[sequence_name]
    return f"{_PHOTO_SET_CHUNK_TASK_PREFIX}{chunk_number:05d}"


def _outputs_for_sequence(
    sequence_name: SequenceName,
    source_job: ProductionJob,
    *,
    item_count: int,
    start_index: int = 1,
    variant_id: str | None = None,
) -> tuple[str, ...]:
    output = _single_job_output(source_job)
    _validate_relative_artifact_path(output, expected_root="deliverables")
    expected_output = _SEQUENCE_CANONICAL_OUTPUTS[sequence_name]
    if output != expected_output:
        raise AssemblyPlanError(f"Unexpected {sequence_name} output path: {output}")
    if variant_id is not None:
        if sequence_name != "reel":
            raise AssemblyPlanError("Only reel render tasks can have variant outputs")
        _validate_reel_variant_id(variant_id)
        return (f"deliverables/instagram_reels/{variant_id}.mp4",)
    if sequence_name == "reel":
        return (output,)

    output_dir = expected_output.rstrip("/")
    prefix = "slide" if sequence_name == "carousel" else "photo"
    return tuple(
        f"{output_dir}/{prefix}_{index:05d}.jpg"
        for index in range(start_index, start_index + item_count)
    )


def _single_job_output(job: ProductionJob) -> str:
    if len(job.outputs) != 1:
        raise AssemblyPlanError(f"Job must have exactly one output: {job.job_id}")
    return job.outputs[0]


def _media_kind_from_output_kind(output_kind: str) -> MediaKind:
    media_kind = output_kind.removeprefix("graded_")
    if media_kind not in {"photo", "video"}:
        raise AssemblyPlanError(f"Unsupported graded output kind: {output_kind}")
    return media_kind  # type: ignore[return-value]


def _validate_photo_set_chunk_size(chunk_size: int) -> None:
    if isinstance(chunk_size, bool) or not isinstance(chunk_size, int) or chunk_size < 1:
        raise AssemblyPlanError("photo_set_chunk_size must be a positive integer")


def _validate_relative_artifact_path(path: str, *, expected_root: str) -> None:
    artifact_path = Path(path)
    if artifact_path.is_absolute() or ".." in artifact_path.parts:
        raise AssemblyPlanError(f"Unsafe artifact path: {path}")
    if not artifact_path.parts or artifact_path.parts[0] != expected_root:
        raise AssemblyPlanError(f"Unexpected artifact path: {path}")


def _validate_assembly_plan(plan: AssemblyPlan) -> None:
    if not isinstance(plan.shoot_slug, str) or not plan.shoot_slug.strip():
        raise AssemblyPlanError("Assembly plan shoot_slug cannot be empty")
    if not isinstance(plan.render_tasks, tuple):
        raise AssemblyPlanError("Assembly render_tasks must be a tuple")
    task_ids: set[str] = set()
    output_paths: set[str] = set()
    for task in plan.render_tasks:
        _validate_render_task(task, task_ids=task_ids, output_paths=output_paths)
    _validate_photo_set_task_group(plan.render_tasks)


def _validate_render_task(
    task: RenderTask,
    *,
    task_ids: set[str],
    output_paths: set[str],
) -> None:
    if not isinstance(task, RenderTask):
        raise AssemblyPlanError("Assembly render task must be a RenderTask")
    if not isinstance(task.task_id, str) or not task.task_id.strip():
        raise AssemblyPlanError("Render task id cannot be empty")
    if task.task_id in task_ids:
        raise AssemblyPlanError(f"Duplicate render task id: {task.task_id}")
    task_ids.add(task.task_id)
    if task.sequence_name not in _SEQUENCE_ORDER:
        raise AssemblyPlanError(f"Unknown render task sequence: {task.sequence_name}")
    if not _is_expected_task_id(task):
        raise AssemblyPlanError(f"Unexpected {task.sequence_name} task id: {task.task_id}")
    if not isinstance(task.source_job_id, str) or not task.source_job_id.strip():
        raise AssemblyPlanError(f"Render task source job cannot be empty: {task.task_id}")
    if task.source_job_id != _SEQUENCE_JOB_IDS[task.sequence_name]:
        raise AssemblyPlanError(f"Unexpected {task.sequence_name} source job: {task.source_job_id}")
    if not isinstance(task.output_kind, str) or not task.output_kind.strip():
        raise AssemblyPlanError(f"Render task output kind cannot be empty: {task.task_id}")
    if task.output_kind != _SEQUENCE_OUTPUT_KINDS[task.sequence_name]:
        raise AssemblyPlanError(f"Unexpected {task.sequence_name} output kind: {task.output_kind}")
    if not isinstance(task.aspect_ratio, str) or not task.aspect_ratio.strip():
        raise AssemblyPlanError(f"Render task aspect ratio cannot be empty: {task.task_id}")
    if task.aspect_ratio != _SEQUENCE_ASPECT_RATIOS[task.sequence_name]:
        raise AssemblyPlanError(f"Unexpected {task.sequence_name} aspect ratio: {task.aspect_ratio}")
    if not isinstance(task.inputs, tuple) or not task.inputs:
        raise AssemblyPlanError(f"Render task inputs must be a non-empty tuple: {task.task_id}")
    if not isinstance(task.outputs, tuple) or not task.outputs:
        raise AssemblyPlanError(f"Render task outputs must be a non-empty tuple: {task.task_id}")
    if not isinstance(task.depends_on, tuple):
        raise AssemblyPlanError(f"Render task dependencies must be a tuple: {task.task_id}")
    if not isinstance(task.can_run_in_parallel, bool):
        raise AssemblyPlanError(f"Render task parallel flag must be boolean: {task.task_id}")
    if _is_photo_set_chunk_task(task) and not task.can_run_in_parallel:
        raise AssemblyPlanError(f"Photo set chunk task must be parallelizable: {task.task_id}")
    for input_path in task.inputs:
        _validate_render_input_path(input_path)
    for output_path in task.outputs:
        _validate_render_output_path(output_path)
        if output_path in output_paths:
            raise AssemblyPlanError(f"Duplicate render task output: {output_path}")
        output_paths.add(output_path)
    for dependency in task.depends_on:
        if not isinstance(dependency, str) or not dependency.strip():
            raise AssemblyPlanError(f"Render task dependency cannot be empty: {task.task_id}")
    graded_inputs = _graded_inputs_for_task(task)
    expected_dependencies = ("rank_instagram_storylines",) + tuple(
        _grade_job_id_for_input(input_path) for input_path in graded_inputs
    )
    if task.depends_on != expected_dependencies:
        raise AssemblyPlanError(
            f"Unexpected {task.sequence_name} dependencies: {task.depends_on}"
        )
    if _is_photo_set_chunk_task(task):
        _validate_photo_set_chunk_outputs(task, item_count=len(graded_inputs))
    else:
        expected_outputs = _canonical_outputs_for_task(
            task,
            item_count=len(graded_inputs),
        )
        if task.outputs != expected_outputs:
            raise AssemblyPlanError(f"Unexpected {task.sequence_name} outputs: {task.outputs}")


def _is_expected_task_id(task: RenderTask) -> bool:
    if task.sequence_name == "reel" and _reel_variant_id_from_task(task) is not None:
        return True
    if task.sequence_name == "photo_set" and _is_photo_set_chunk_task(task):
        return True
    return task.task_id == _SEQUENCE_TASK_IDS[task.sequence_name]


def _is_photo_set_chunk_task(task: RenderTask) -> bool:
    return (
        task.sequence_name == "photo_set"
        and _PHOTO_SET_CHUNK_TASK_PATTERN.fullmatch(task.task_id) is not None
    )


def _reel_variant_id_from_task(task: RenderTask) -> str | None:
    if task.sequence_name != "reel":
        return None
    match = _REEL_VARIANT_TASK_PATTERN.fullmatch(task.task_id)
    if match is None:
        return None
    return match.group(1)


def _validate_reel_variant_id(variant_id: str) -> None:
    if not isinstance(variant_id, str) or not _REEL_VARIANT_TASK_PATTERN.fullmatch(
        f"{_REEL_VARIANT_TASK_PREFIX}{variant_id}"
    ):
        raise AssemblyPlanError(f"Invalid reel variant id: {variant_id}")


def _validate_render_input_path(path: str) -> None:
    if not isinstance(path, str) or not path.strip():
        raise AssemblyPlanError("Render task input path cannot be empty")
    artifact_path = Path(path)
    if artifact_path.is_absolute() or ".." in artifact_path.parts:
        raise AssemblyPlanError(f"Unsafe render task input path: {path}")
    if not artifact_path.parts or artifact_path.parts[0] not in {"analysis", "graded"}:
        raise AssemblyPlanError(f"Unexpected render task input path: {path}")


def _validate_render_output_path(path: str) -> None:
    if not isinstance(path, str) or not path.strip():
        raise AssemblyPlanError("Render task output path cannot be empty")
    artifact_path = Path(path)
    if artifact_path.is_absolute() or ".." in artifact_path.parts:
        raise AssemblyPlanError(f"Unsafe render task output path: {path}")
    if not artifact_path.parts or artifact_path.parts[0] != "deliverables":
        raise AssemblyPlanError(f"Unexpected render task output path: {path}")


def _graded_inputs_for_task(task: RenderTask) -> tuple[str, ...]:
    if task.inputs[0] != STORYLINE_ARTIFACT_PATH:
        raise AssemblyPlanError(
            f"Render task first input must be {STORYLINE_ARTIFACT_PATH}: {task.task_id}"
        )
    graded_inputs = task.inputs[1:]
    if not graded_inputs:
        raise AssemblyPlanError(f"Render task must include graded media inputs: {task.task_id}")
    for input_path in graded_inputs:
        if Path(input_path).parts[0] != "graded":
            raise AssemblyPlanError(f"Unexpected render task graded input path: {input_path}")
    return graded_inputs


def _grade_job_id_for_input(input_path: str) -> str:
    parts = Path(input_path).parts
    if len(parts) < 3 or not parts[1]:
        raise AssemblyPlanError(f"Unexpected render task graded input path: {input_path}")
    return parts[1]


def _canonical_outputs_for_task(task: RenderTask, *, item_count: int) -> tuple[str, ...]:
    sequence_name = task.sequence_name
    reel_variant_id = _reel_variant_id_from_task(task)
    if reel_variant_id is not None:
        return (f"deliverables/instagram_reels/{reel_variant_id}.mp4",)
    expected_output = _SEQUENCE_CANONICAL_OUTPUTS[sequence_name]
    if sequence_name == "reel":
        return (expected_output,)
    output_dir = expected_output.rstrip("/")
    prefix = "slide" if sequence_name == "carousel" else "photo"
    return tuple(f"{output_dir}/{prefix}_{index:05d}.jpg" for index in range(1, item_count + 1))


def _validate_photo_set_chunk_outputs(task: RenderTask, *, item_count: int) -> None:
    if len(task.outputs) != item_count:
        raise AssemblyPlanError(f"Unexpected photo_set output count: {task.outputs}")
    output_numbers = [_photo_set_output_number(output_path) for output_path in task.outputs]
    if output_numbers != list(range(output_numbers[0], output_numbers[0] + item_count)):
        raise AssemblyPlanError(f"Unexpected photo_set outputs: {task.outputs}")


def _validate_photo_set_task_group(render_tasks: tuple[RenderTask, ...]) -> None:
    photo_set_tasks = tuple(task for task in render_tasks if task.sequence_name == "photo_set")
    if not photo_set_tasks:
        return

    chunk_tasks = tuple(task for task in photo_set_tasks if _is_photo_set_chunk_task(task))
    if chunk_tasks and len(chunk_tasks) != len(photo_set_tasks):
        raise AssemblyPlanError("Cannot mix chunked and unchunked photo_set render tasks")
    if not chunk_tasks:
        return

    expected_task_ids = tuple(
        f"{_PHOTO_SET_CHUNK_TASK_PREFIX}{index:05d}" for index in range(1, len(chunk_tasks) + 1)
    )
    actual_task_ids = tuple(task.task_id for task in chunk_tasks)
    if actual_task_ids != expected_task_ids:
        raise AssemblyPlanError(f"Unexpected photo_set chunk task order: {actual_task_ids}")

    output_numbers = [
        _photo_set_output_number(output_path)
        for task in chunk_tasks
        for output_path in task.outputs
    ]
    expected_output_numbers = list(range(1, len(output_numbers) + 1))
    if output_numbers != expected_output_numbers:
        raise AssemblyPlanError(f"Unexpected photo_set chunk outputs: {output_numbers}")


def _photo_set_output_number(output_path: str) -> int:
    match = _PHOTO_SET_OUTPUT_PATTERN.fullmatch(output_path)
    if match is None:
        raise AssemblyPlanError(f"Unexpected photo_set output path: {output_path}")
    output_number = int(match.group(1))
    if output_number < 1:
        raise AssemblyPlanError(f"Unexpected photo_set output path: {output_path}")
    return output_number


def _render_tasks_manifest_path(workspace_root: Path | str) -> Path:
    root = Path(workspace_root)
    if root.is_symlink():
        raise AssemblyPlanError(f"Refusing render task workspace symlink: {root}")
    return root / RENDER_TASKS_MANIFEST_PATH


def _assembly_plan_json(plan: AssemblyPlan) -> str:
    return json.dumps(_assembly_plan_to_json(plan), indent=2, sort_keys=True) + "\n"


def _assembly_plan_to_json(plan: AssemblyPlan) -> dict[str, object]:
    return {
        "schema_version": _RENDER_TASKS_SCHEMA_VERSION,
        "shoot_slug": plan.shoot_slug,
        "render_tasks": [_render_task_to_json(task) for task in plan.render_tasks],
    }


def _render_task_to_json(task: RenderTask) -> dict[str, object]:
    return {
        "task_id": task.task_id,
        "sequence_name": task.sequence_name,
        "source_job_id": task.source_job_id,
        "output_kind": task.output_kind,
        "aspect_ratio": task.aspect_ratio,
        "inputs": list(task.inputs),
        "outputs": list(task.outputs),
        "depends_on": list(task.depends_on),
        "can_run_in_parallel": task.can_run_in_parallel,
    }


def _read_json_object(path: Path) -> dict[str, object]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise AssemblyPlanError(f"Missing render task manifest: {path}") from exc
    except json.JSONDecodeError as exc:
        raise AssemblyPlanError(f"Invalid render task manifest JSON: {path}") from exc
    if not isinstance(raw, dict):
        raise AssemblyPlanError(f"Render task manifest root must be an object: {path}")
    return raw


def _assembly_plan_from_json(raw_manifest: dict[str, object]) -> AssemblyPlan:
    _validate_exact_keys(raw_manifest, allowed_keys=_MANIFEST_KEYS, label="manifest")
    if raw_manifest.get("schema_version") != _RENDER_TASKS_SCHEMA_VERSION:
        raise AssemblyPlanError("Unsupported render task manifest schema version")
    raw_tasks = raw_manifest.get("render_tasks")
    if not isinstance(raw_tasks, list):
        raise AssemblyPlanError("Render task manifest must contain a render_tasks list")
    return AssemblyPlan(
        shoot_slug=_required_manifest_string(raw_manifest, "shoot_slug"),
        render_tasks=tuple(_render_task_from_json(raw_task) for raw_task in raw_tasks),
    )


def _render_task_from_json(raw_task: object) -> RenderTask:
    if not isinstance(raw_task, dict):
        raise AssemblyPlanError("Render task must be an object")
    _validate_exact_keys(raw_task, allowed_keys=_TASK_KEYS, label="task")
    return RenderTask(
        task_id=_required_task_string(raw_task, "task_id"),
        sequence_name=_required_sequence_name(raw_task),
        source_job_id=_required_task_string(raw_task, "source_job_id"),
        output_kind=_required_task_string(raw_task, "output_kind"),
        aspect_ratio=_required_task_string(raw_task, "aspect_ratio"),
        inputs=_required_string_tuple(raw_task, "inputs"),
        outputs=_required_string_tuple(raw_task, "outputs"),
        depends_on=_required_string_tuple(raw_task, "depends_on"),
        can_run_in_parallel=_required_task_bool(raw_task, "can_run_in_parallel"),
    )


def _required_manifest_string(raw_manifest: Mapping[str, object], key: str) -> str:
    value = raw_manifest.get(key)
    if not isinstance(value, str) or not value.strip():
        raise AssemblyPlanError(f"Render task manifest field must be a non-empty string: {key}")
    return value


def _required_task_string(raw_task: Mapping[str, object], key: str) -> str:
    value = raw_task.get(key)
    if not isinstance(value, str) or not value.strip():
        raise AssemblyPlanError(f"Render task field must be a non-empty string: {key}")
    return value


def _required_sequence_name(raw_task: Mapping[str, object]) -> SequenceName:
    value = _required_task_string(raw_task, "sequence_name")
    if value not in _SEQUENCE_ORDER:
        raise AssemblyPlanError(f"Unknown render task sequence: {value}")
    return value  # type: ignore[return-value]


def _required_string_tuple(raw_task: Mapping[str, object], key: str) -> tuple[str, ...]:
    value = raw_task.get(key)
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise AssemblyPlanError(f"Render task field must be a list of strings: {key}")
    return tuple(value)


def _required_task_bool(raw_task: Mapping[str, object], key: str) -> bool:
    value = raw_task.get(key)
    if not isinstance(value, bool):
        raise AssemblyPlanError(f"Render task field must be boolean: {key}")
    return value


def _validate_exact_keys(
    raw_object: Mapping[str, object],
    *,
    allowed_keys: frozenset[str],
    label: str,
) -> None:
    actual_keys = set(raw_object)
    unexpected_keys = sorted(str(key) for key in actual_keys - allowed_keys)
    if unexpected_keys:
        raise AssemblyPlanError(f"Unexpected render {label} field: {', '.join(unexpected_keys)}")
    missing_keys = sorted(allowed_keys - actual_keys)
    if missing_keys:
        raise AssemblyPlanError(f"Missing render {label} field: {', '.join(missing_keys)}")


def _safe_workspace_path(root: Path, relative_path: str) -> Path:
    path = Path(relative_path)
    if path.is_absolute() or ".." in path.parts:
        raise AssemblyPlanError(f"Unsafe selected asset path: {relative_path}")
    return root / path


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    current = path
    while True:
        if current.is_symlink():
            raise AssemblyPlanError(f"Refusing {label} symlink: {current}")
        if current == root or current.absolute() == root.absolute():
            break
        if current.parent == current:
            break
        current = current.parent
