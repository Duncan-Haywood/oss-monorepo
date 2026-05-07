from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Literal

from shootflow.production import ProductionJob, ProductionPlan
from shootflow.story import AssetAnalysis

_ANALYSIS_FILE_PATTERN = re.compile(r"analysis/[0-9]{5}\.json$")
_SUPPORTED_MEDIA_TYPES = {"photo", "video"}


class AnalysisLoaderError(ValueError):
    """Raised when VLM analysis files do not match a trusted production plan."""


def load_asset_analyses(plan: ProductionPlan, workspace_root: Path | str) -> list[AssetAnalysis]:
    if not isinstance(plan, ProductionPlan):
        raise TypeError("plan must be a ProductionPlan")
    root = Path(workspace_root)
    if root.is_symlink():
        raise AnalysisLoaderError(f"Refusing analysis workspace symlink: {root}")

    analysis_jobs = tuple(job for job in plan.jobs if job.output_kind == "vlm_asset_analysis")
    grade_jobs_by_analysis_id = _grade_jobs_by_analysis_id(plan)
    expected_outputs = {_planned_analysis_output(job) for job in analysis_jobs}
    _reject_unplanned_analysis_files(root, expected_outputs)

    analyses: list[AssetAnalysis] = []
    for analysis_job in analysis_jobs:
        output = _planned_analysis_output(analysis_job)
        analysis_path = _safe_workspace_path(root, output)
        _reject_symlink_path(analysis_path, root, "analysis file")
        if not analysis_path.is_file():
            raise AnalysisLoaderError(f"Missing planned analysis file: {output}")

        raw_analysis = _read_json_object(analysis_path)
        grade_job = grade_jobs_by_analysis_id.get(analysis_job.job_id)
        if grade_job is None:
            raise AnalysisLoaderError(f"No graded artifact job for analysis: {analysis_job.job_id}")

        analyses.append(_analysis_from_json(raw_analysis, analysis_job=analysis_job, grade_job=grade_job))

    return analyses


def _grade_jobs_by_analysis_id(plan: ProductionPlan) -> dict[str, ProductionJob]:
    grade_jobs_by_analysis_id: dict[str, ProductionJob] = {}
    for job in plan.jobs:
        if not job.output_kind.startswith("graded_"):
            continue
        analysis_dependencies = tuple(
            dependency for dependency in job.depends_on if dependency.startswith("analyze_asset_")
        )
        if len(analysis_dependencies) != 1:
            raise AnalysisLoaderError(f"Graded job must depend on exactly one analysis job: {job.job_id}")
        analysis_id = analysis_dependencies[0]
        if analysis_id in grade_jobs_by_analysis_id:
            raise AnalysisLoaderError(f"Duplicate graded job for analysis: {analysis_id}")
        grade_jobs_by_analysis_id[analysis_id] = job
    return grade_jobs_by_analysis_id


def _planned_analysis_output(job: ProductionJob) -> str:
    if len(job.inputs) != 1:
        raise AnalysisLoaderError(f"Analysis job must have exactly one input: {job.job_id}")
    if len(job.outputs) != 1:
        raise AnalysisLoaderError(f"Analysis job must have exactly one output: {job.job_id}")
    output = job.outputs[0]
    if not _ANALYSIS_FILE_PATTERN.fullmatch(output):
        raise AnalysisLoaderError(f"Unexpected analysis output path: {output}")
    return output


def _reject_unplanned_analysis_files(root: Path, expected_outputs: set[str]) -> None:
    analysis_dir = root / "analysis"
    if not analysis_dir.exists():
        return
    if analysis_dir.is_symlink():
        raise AnalysisLoaderError(f"Refusing analysis directory symlink: {analysis_dir}")
    for candidate in analysis_dir.glob("*.json"):
        relative = candidate.relative_to(root).as_posix()
        if _ANALYSIS_FILE_PATTERN.fullmatch(relative) and relative not in expected_outputs:
            raise AnalysisLoaderError(f"Unplanned per-asset analysis file: {relative}")


def _safe_workspace_path(root: Path, relative_output: str) -> Path:
    output = Path(relative_output)
    if output.is_absolute() or ".." in output.parts:
        raise AnalysisLoaderError(f"Unsafe analysis output path: {relative_output}")
    path = root / output
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise AnalysisLoaderError(f"Analysis output escapes workspace: {relative_output}") from exc
    return path


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
        if candidate.exists() and candidate.is_symlink():
            raise AnalysisLoaderError(f"Refusing {label} symlink: {candidate}")


def _read_json_object(path: Path) -> dict[str, object]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise AnalysisLoaderError(f"Invalid analysis JSON: {path}") from exc
    if not isinstance(raw, dict):
        raise AnalysisLoaderError(f"Analysis JSON root must be an object: {path}")
    return raw


def _analysis_from_json(
    raw_analysis: dict[str, object],
    *,
    analysis_job: ProductionJob,
    grade_job: ProductionJob,
) -> AssetAnalysis:
    planned_source_path = analysis_job.inputs[0]
    source_asset_path = _required_string(raw_analysis, "source_asset_path")
    if source_asset_path != planned_source_path:
        raise AnalysisLoaderError(
            f"Analysis source asset does not match planned asset: {source_asset_path}"
        )

    media_type = _required_media_type(raw_analysis)
    expected_media_type = _media_type_from_grade_job(grade_job)
    if media_type != expected_media_type:
        raise AnalysisLoaderError(
            f"Analysis media type does not match planned asset: {planned_source_path}"
        )

    scene_label = _required_string(raw_analysis, "scene_label").strip()
    if not scene_label:
        raise AnalysisLoaderError(f"Analysis scene label cannot be empty: {planned_source_path}")

    duration_seconds = _optional_score(raw_analysis, "duration_seconds")
    if media_type == "video":
        if duration_seconds is None:
            raise AnalysisLoaderError(f"Video duration is required: {planned_source_path}")
        if duration_seconds < 0:
            raise AnalysisLoaderError(f"Video duration cannot be negative: {planned_source_path}")
    elif duration_seconds is not None and duration_seconds < 0:
        raise AnalysisLoaderError(f"Duration cannot be negative: {planned_source_path}")

    if len(grade_job.outputs) != 1:
        raise AnalysisLoaderError(f"Graded job must have exactly one output: {grade_job.job_id}")

    return AssetAnalysis(
        asset_path=grade_job.outputs[0],
        media_type=media_type,
        scene_label=scene_label,
        aesthetic_score=_required_score(raw_analysis, "aesthetic_score"),
        story_score=_required_score(raw_analysis, "story_score"),
        technical_score=_required_score(raw_analysis, "technical_score"),
        motion_score=_required_score(raw_analysis, "motion_score"),
        duration_seconds=duration_seconds,
        tags=_optional_tags(raw_analysis),
    )


def _required_media_type(raw_analysis: dict[str, object]) -> Literal["photo", "video"]:
    media_type = _required_string(raw_analysis, "media_type")
    if media_type not in _SUPPORTED_MEDIA_TYPES:
        raise AnalysisLoaderError(f"Unsupported analysis media type: {media_type}")
    return media_type  # type: ignore[return-value]


def _media_type_from_grade_job(job: ProductionJob) -> Literal["photo", "video"]:
    media_type = job.output_kind.removeprefix("graded_")
    if media_type not in _SUPPORTED_MEDIA_TYPES:
        raise AnalysisLoaderError(f"Unsupported graded media type: {job.output_kind}")
    return media_type  # type: ignore[return-value]


def _required_string(raw_analysis: dict[str, object], key: str) -> str:
    value = raw_analysis.get(key)
    if not isinstance(value, str):
        raise AnalysisLoaderError(f"Analysis field must be a string: {key}")
    return value


def _required_score(raw_analysis: dict[str, object], key: str) -> float:
    value = _optional_score(raw_analysis, key)
    if value is None:
        raise AnalysisLoaderError(f"Analysis score is required: {key}")
    if value < 0 or value > 1:
        raise AnalysisLoaderError(f"{key} must be between 0 and 1")
    return value


def _optional_score(raw_analysis: dict[str, object], key: str) -> float | None:
    value = raw_analysis.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise AnalysisLoaderError(f"Analysis numeric field is invalid: {key}")
    score = float(value)
    if not math.isfinite(score):
        raise AnalysisLoaderError(f"Analysis numeric field is not finite: {key}")
    return score


def _optional_tags(raw_analysis: dict[str, object]) -> tuple[str, ...]:
    value = raw_analysis.get("tags", [])
    if not isinstance(value, list):
        raise AnalysisLoaderError("Analysis tags must be a list of strings")
    if any(not isinstance(tag, str) or not tag for tag in value):
        raise AnalysisLoaderError("Analysis tags must be a list of non-empty strings")
    return tuple(value)
