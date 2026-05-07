from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from shootflow.production import ProductionJob, ProductionPlan
from shootflow.story import ContentSequence, STORYLINE_ARTIFACT_PATH, load_storyline_artifact

SequenceName = Literal["reel", "carousel", "photo_set"]
MediaKind = Literal["photo", "video"]

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
_SEQUENCE_TASK_IDS: dict[SequenceName, str] = {
    "reel": "render_instagram_reel",
    "carousel": "render_instagram_carousel",
    "photo_set": "export_instagram_photo_set",
}


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


def build_assembly_plan(plan: ProductionPlan, workspace_root: Path | str) -> AssemblyPlan:
    if not isinstance(plan, ProductionPlan):
        raise TypeError("plan must be a ProductionPlan")
    root = Path(workspace_root)
    if root.is_symlink():
        raise AssemblyPlanError(f"Refusing assembly workspace symlink: {root}")

    graded_outputs = _graded_outputs_by_path(plan)
    storyline = load_storyline_artifact(root, allowed_asset_paths=frozenset(graded_outputs))
    deliverable_jobs = _deliverable_jobs_by_id(plan)

    render_tasks: list[RenderTask] = []
    for sequence_name in _SEQUENCE_ORDER:
        sequence = getattr(storyline, sequence_name)
        if not sequence.asset_paths:
            continue
        _validate_sequence_media(sequence_name, sequence, graded_outputs=graded_outputs)
        _verify_selected_assets_exist(root, sequence.asset_paths)
        render_tasks.append(
            _render_task_for_sequence(
                sequence_name,
                sequence,
                deliverable_jobs=deliverable_jobs,
            )
        )

    return AssemblyPlan(shoot_slug=plan.shoot_slug, render_tasks=tuple(render_tasks))


def _graded_outputs_by_path(plan: ProductionPlan) -> dict[str, MediaKind]:
    outputs: dict[str, MediaKind] = {}
    for job in plan.jobs:
        if not job.output_kind.startswith("graded_"):
            continue
        media_kind = _media_kind_from_output_kind(job.output_kind)
        output = _single_job_output(job)
        _validate_relative_artifact_path(output, expected_root="graded")
        if output in outputs:
            raise AssemblyPlanError(f"Duplicate graded output path: {output}")
        outputs[output] = media_kind
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
    graded_outputs: dict[str, MediaKind],
) -> None:
    required_media = _SEQUENCE_MEDIA[sequence_name]
    for asset_path in sequence.asset_paths:
        media_kind = graded_outputs.get(asset_path)
        if media_kind != required_media:
            raise AssemblyPlanError(f"{sequence_name} requires {required_media} graded assets: {asset_path}")


def _verify_selected_assets_exist(root: Path, asset_paths: tuple[str, ...]) -> None:
    for asset_path in asset_paths:
        path = _safe_workspace_path(root, asset_path)
        _reject_symlink_path(path, root, "graded asset")
        if not path.is_file():
            raise AssemblyPlanError(f"Missing graded asset: {asset_path}")


def _render_task_for_sequence(
    sequence_name: SequenceName,
    sequence: ContentSequence,
    *,
    deliverable_jobs: dict[str, ProductionJob],
) -> RenderTask:
    source_job_id = _SEQUENCE_JOB_IDS[sequence_name]
    try:
        source_job = deliverable_jobs[source_job_id]
    except KeyError as exc:
        raise AssemblyPlanError(f"Missing deliverable job for sequence: {sequence_name}") from exc

    outputs = _outputs_for_sequence(sequence_name, source_job, item_count=len(sequence.asset_paths))
    return RenderTask(
        task_id=_SEQUENCE_TASK_IDS[sequence_name],
        sequence_name=sequence_name,
        source_job_id=source_job_id,
        output_kind=sequence.output_kind,
        aspect_ratio=sequence.aspect_ratio,
        inputs=(STORYLINE_ARTIFACT_PATH,) + sequence.asset_paths,
        outputs=outputs,
        depends_on=source_job.depends_on,
        can_run_in_parallel=source_job.can_run_in_parallel,
    )


def _outputs_for_sequence(
    sequence_name: SequenceName,
    source_job: ProductionJob,
    *,
    item_count: int,
) -> tuple[str, ...]:
    output = _single_job_output(source_job)
    _validate_relative_artifact_path(output, expected_root="deliverables")
    if sequence_name == "reel":
        return (output,)

    output_dir = output.rstrip("/")
    prefix = "slide" if sequence_name == "carousel" else "photo"
    return tuple(f"{output_dir}/{prefix}_{index:05d}.jpg" for index in range(1, item_count + 1))


def _single_job_output(job: ProductionJob) -> str:
    if len(job.outputs) != 1:
        raise AssemblyPlanError(f"Job must have exactly one output: {job.job_id}")
    return job.outputs[0]


def _media_kind_from_output_kind(output_kind: str) -> MediaKind:
    media_kind = output_kind.removeprefix("graded_")
    if media_kind not in {"photo", "video"}:
        raise AssemblyPlanError(f"Unsupported graded output kind: {output_kind}")
    return media_kind  # type: ignore[return-value]


def _validate_relative_artifact_path(path: str, *, expected_root: str) -> None:
    artifact_path = Path(path)
    if artifact_path.is_absolute() or ".." in artifact_path.parts:
        raise AssemblyPlanError(f"Unsafe artifact path: {path}")
    if not artifact_path.parts or artifact_path.parts[0] != expected_root:
        raise AssemblyPlanError(f"Unexpected artifact path: {path}")


def _safe_workspace_path(root: Path, relative_path: str) -> Path:
    path = Path(relative_path)
    if path.is_absolute() or ".." in path.parts:
        raise AssemblyPlanError(f"Unsafe selected asset path: {relative_path}")
    workspace_path = root / path
    try:
        workspace_path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise AssemblyPlanError(f"Selected asset escapes workspace: {relative_path}") from exc
    return workspace_path


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    resolved_root = root.resolve()
    current = path
    chain: list[Path] = []
    while True:
        chain.append(current)
        if current == root or current.resolve() == resolved_root:
            break
        if current.parent == current:
            break
        current = current.parent
    for candidate in reversed(chain):
        if candidate.is_symlink():
            raise AssemblyPlanError(f"Refusing {label} symlink: {candidate}")
