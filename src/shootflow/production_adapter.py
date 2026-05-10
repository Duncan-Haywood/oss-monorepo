from __future__ import annotations

import hashlib
import json
import math
import os
import stat
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from shootflow.analysis import AnalysisLoaderError, load_asset_analyses
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
_PROXY_PRODUCTION_ADAPTER = "proxy-production-local"
_ANALYSIS_PRODUCTION_ADAPTER = "analysis-production-local"
_SCENE_PRODUCTION_ADAPTER = "scene-production-local"
_LOOK_PRODUCTION_ADAPTER = "look-production-local"
_GRADE_PRODUCTION_ADAPTER = "grade-production-local"
_PRODUCTION_ADAPTER_OUTPUT_KINDS: dict[str, tuple[str, ...] | None] = {
    _DRY_RUN_PRODUCTION_ADAPTER: None,
    _METADATA_PRODUCTION_ADAPTER: None,
    _PROXY_PRODUCTION_ADAPTER: ("proxy_media",),
    _ANALYSIS_PRODUCTION_ADAPTER: ("vlm_asset_analysis",),
    _SCENE_PRODUCTION_ADAPTER: ("scene_grouping",),
    _LOOK_PRODUCTION_ADAPTER: ("look_development",),
    _GRADE_PRODUCTION_ADAPTER: ("graded_photo", "graded_video"),
}


class ProductionAdapterError(ValueError):
    """Raised when a production adapter cannot safely run a job."""


@dataclass(frozen=True)
class ProductionAdapterResult:
    job_id: str
    claimed_status: ProductionJobStatus
    final_status: ProductionJobStatus
    manifest: ProductionStatusManifest
    outputs_materialized: tuple[str, ...]


@dataclass(frozen=True)
class MetadataProductionAdapterResult(ProductionAdapterResult):
    """Result from the local metadata adapter.

    It intentionally shares the adapter result shape so scheduler reports and
    status transitions remain adapter-neutral while a real local worker proves
    input-reading behavior.
    """


@dataclass(frozen=True)
class ProxyProductionAdapterResult(ProductionAdapterResult):
    """Result from the local proxy adapter."""


@dataclass(frozen=True)
class AnalysisProductionAdapterResult(ProductionAdapterResult):
    """Result from the deterministic local analysis adapter."""


@dataclass(frozen=True)
class SceneProductionAdapterResult(ProductionAdapterResult):
    """Result from the deterministic local scene-grouping adapter."""


@dataclass(frozen=True)
class LookProductionAdapterResult(ProductionAdapterResult):
    """Result from the deterministic local shoot-look adapter."""


@dataclass(frozen=True)
class GradeProductionAdapterResult(ProductionAdapterResult):
    """Result from the deterministic local grading adapter."""


@dataclass(frozen=True)
class ProductionAdapterFailure:
    job_id: str
    error_message: str


@dataclass(frozen=True)
class ProductionAdapterBatchResult:
    shoot_slug: str
    worker_adapter: str
    max_concurrency: int
    results: tuple[ProductionAdapterResult, ...]
    failures: tuple[ProductionAdapterFailure, ...]
    blocked_job_ids: tuple[str, ...]


def supported_production_adapter_names() -> tuple[str, ...]:
    """Return production adapter names that this build can execute locally."""

    return tuple(_PRODUCTION_ADAPTER_OUTPUT_KINDS)


def supported_production_adapter_output_kinds(adapter_name: str) -> tuple[str, ...] | None:
    """Return the output kinds an adapter may schedule, or None for all kinds."""

    if not isinstance(adapter_name, str) or not adapter_name.strip():
        raise ProductionAdapterError("adapter_name must be a non-empty string")
    try:
        output_kinds = _PRODUCTION_ADAPTER_OUTPUT_KINDS[adapter_name]
    except KeyError as exc:
        supported_adapters = ", ".join(supported_production_adapter_names()) or "none"
        raise ProductionAdapterError(
            f"Unsupported production adapter: {adapter_name}. "
            f"Supported adapters: {supported_adapters}"
        ) from exc
    if output_kinds is None:
        return None
    return tuple(output_kinds)


def run_production_adapter_batch(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action_plan: ProductionWorkerActionPlan,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
) -> ProductionAdapterBatchResult:
    """Run a supported production adapter batch by explicit adapter name."""

    if not isinstance(action_plan, ProductionWorkerActionPlan):
        raise ProductionAdapterError("action_plan must be a ProductionWorkerActionPlan")
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
    if action_plan.worker_adapter == _PROXY_PRODUCTION_ADAPTER:
        return run_proxy_production_batch(
            workspace_root,
            trusted_plan=trusted_plan,
            action_plan=action_plan,
            started_at=started_at,
            completed_at=completed_at,
            max_concurrency=max_concurrency,
        )
    if action_plan.worker_adapter == _ANALYSIS_PRODUCTION_ADAPTER:
        return run_analysis_production_batch(
            workspace_root,
            trusted_plan=trusted_plan,
            action_plan=action_plan,
            started_at=started_at,
            completed_at=completed_at,
            max_concurrency=max_concurrency,
        )
    if action_plan.worker_adapter == _SCENE_PRODUCTION_ADAPTER:
        return run_scene_production_batch(
            workspace_root,
            trusted_plan=trusted_plan,
            action_plan=action_plan,
            started_at=started_at,
            completed_at=completed_at,
            max_concurrency=max_concurrency,
        )
    if action_plan.worker_adapter == _LOOK_PRODUCTION_ADAPTER:
        return run_look_production_batch(
            workspace_root,
            trusted_plan=trusted_plan,
            action_plan=action_plan,
            started_at=started_at,
            completed_at=completed_at,
            max_concurrency=max_concurrency,
        )
    if action_plan.worker_adapter == _GRADE_PRODUCTION_ADAPTER:
        return run_grade_production_batch(
            workspace_root,
            trusted_plan=trusted_plan,
            action_plan=action_plan,
            started_at=started_at,
            completed_at=completed_at,
            max_concurrency=max_concurrency,
        )
    supported_adapters = ", ".join(supported_production_adapter_names())
    raise ProductionAdapterError(
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
) -> ProductionAdapterBatchResult:
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
) -> ProductionAdapterBatchResult:
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


def run_proxy_production_batch(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action_plan: ProductionWorkerActionPlan,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
) -> ProductionAdapterBatchResult:
    """Run trusted proxy production actions while respecting parallelism."""

    return _run_adapter_batch(
        workspace_root,
        trusted_plan=trusted_plan,
        action_plan=action_plan,
        started_at=started_at,
        completed_at=completed_at,
        max_concurrency=max_concurrency,
        expected_adapter=_PROXY_PRODUCTION_ADAPTER,
        run_action=run_proxy_production_action,
    )


def run_analysis_production_batch(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action_plan: ProductionWorkerActionPlan,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
) -> ProductionAdapterBatchResult:
    """Run deterministic local analysis actions while respecting parallelism."""

    return _run_adapter_batch(
        workspace_root,
        trusted_plan=trusted_plan,
        action_plan=action_plan,
        started_at=started_at,
        completed_at=completed_at,
        max_concurrency=max_concurrency,
        expected_adapter=_ANALYSIS_PRODUCTION_ADAPTER,
        run_action=run_analysis_production_action,
    )


def run_scene_production_batch(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action_plan: ProductionWorkerActionPlan,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
) -> ProductionAdapterBatchResult:
    """Run deterministic local scene-grouping actions while respecting parallelism."""

    return _run_adapter_batch(
        workspace_root,
        trusted_plan=trusted_plan,
        action_plan=action_plan,
        started_at=started_at,
        completed_at=completed_at,
        max_concurrency=max_concurrency,
        expected_adapter=_SCENE_PRODUCTION_ADAPTER,
        run_action=run_scene_production_action,
    )


def run_look_production_batch(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action_plan: ProductionWorkerActionPlan,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
) -> ProductionAdapterBatchResult:
    """Run deterministic local look-development actions while respecting parallelism."""

    return _run_adapter_batch(
        workspace_root,
        trusted_plan=trusted_plan,
        action_plan=action_plan,
        started_at=started_at,
        completed_at=completed_at,
        max_concurrency=max_concurrency,
        expected_adapter=_LOOK_PRODUCTION_ADAPTER,
        run_action=run_look_production_action,
    )


def run_grade_production_batch(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action_plan: ProductionWorkerActionPlan,
    started_at: str,
    completed_at: str,
    max_concurrency: int,
) -> ProductionAdapterBatchResult:
    """Run deterministic local grading actions while respecting parallelism."""

    return _run_adapter_batch(
        workspace_root,
        trusted_plan=trusted_plan,
        action_plan=action_plan,
        started_at=started_at,
        completed_at=completed_at,
        max_concurrency=max_concurrency,
        expected_adapter=_GRADE_PRODUCTION_ADAPTER,
        run_action=run_grade_production_action,
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
) -> ProductionAdapterBatchResult:
    _validate_action_plan(
        action_plan,
        trusted_plan=trusted_plan,
        expected_adapter=expected_adapter,
    )
    _validate_timestamp(started_at, "started_at")
    _validate_timestamp(completed_at, "completed_at")
    _validate_max_concurrency(max_concurrency)

    ordered_results: dict[int, ProductionAdapterResult] = {}
    ordered_failures: dict[int, ProductionAdapterFailure] = {}
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

    batch_result = ProductionAdapterBatchResult(
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
) -> ProductionAdapterResult:
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
        result_type=ProductionAdapterResult,
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


def run_proxy_production_action(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action: ProductionWorkerAction,
    started_at: str,
    completed_at: str,
) -> ProxyProductionAdapterResult:
    """Persist one trusted proxy action through claim, byte-copy output, and result."""

    _validate_proxy_action_shape(action)
    return _run_production_action(
        workspace_root,
        trusted_plan=trusted_plan,
        action=action,
        started_at=started_at,
        completed_at=completed_at,
        expected_adapter=_PROXY_PRODUCTION_ADAPTER,
        materialize_outputs=_materialize_proxy_production_outputs,
        retryable_error_message=_proxy_retryable_error_message,
        result_type=ProxyProductionAdapterResult,
    )


def run_analysis_production_action(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action: ProductionWorkerAction,
    started_at: str,
    completed_at: str,
) -> AnalysisProductionAdapterResult:
    """Persist one trusted VLM-analysis action through deterministic JSON output.

    This is not a creative VLM. It is a local, deterministic schema probe that
    exercises the analysis-job status/output boundary before real model adapters
    are trusted with customer media.
    """

    _validate_analysis_action_shape(action)
    return _run_production_action(
        workspace_root,
        trusted_plan=trusted_plan,
        action=action,
        started_at=started_at,
        completed_at=completed_at,
        expected_adapter=_ANALYSIS_PRODUCTION_ADAPTER,
        materialize_outputs=_materialize_analysis_production_outputs,
        retryable_error_message=_analysis_retryable_error_message,
        result_type=AnalysisProductionAdapterResult,
    )


def run_scene_production_action(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action: ProductionWorkerAction,
    started_at: str,
    completed_at: str,
) -> SceneProductionAdapterResult:
    """Persist one trusted scene-grouping action through deterministic JSON output.

    This adapter consumes validated per-asset analysis artifacts and writes a
    conservative grouping summary. It is a contract probe for future creative
    scene clustering, not final editorial understanding.
    """

    _validate_scene_action_shape(action)
    return _run_production_action(
        workspace_root,
        trusted_plan=trusted_plan,
        action=action,
        started_at=started_at,
        completed_at=completed_at,
        expected_adapter=_SCENE_PRODUCTION_ADAPTER,
        materialize_outputs=_materialize_scene_production_outputs,
        retryable_error_message=_scene_retryable_error_message,
        result_type=SceneProductionAdapterResult,
    )


def run_look_production_action(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action: ProductionWorkerAction,
    started_at: str,
    completed_at: str,
) -> LookProductionAdapterResult:
    """Persist one trusted shoot-look action through deterministic JSON output.

    This adapter creates a conservative local look profile from the verified
    scene-grouping summary. It proves the scene-to-look handoff before real
    color science, reference-look learning, or grading adapters are trusted.
    """

    _validate_look_action_shape(action)
    return _run_production_action(
        workspace_root,
        trusted_plan=trusted_plan,
        action=action,
        started_at=started_at,
        completed_at=completed_at,
        expected_adapter=_LOOK_PRODUCTION_ADAPTER,
        materialize_outputs=_materialize_look_production_outputs,
        retryable_error_message=_look_retryable_error_message,
        result_type=LookProductionAdapterResult,
    )


def run_grade_production_action(
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan,
    action: ProductionWorkerAction,
    started_at: str,
    completed_at: str,
) -> GradeProductionAdapterResult:
    """Persist one trusted grading action through deterministic local output.

    This adapter applies the verified look-development handoff to one trusted
    asset as a contract probe. It is not final color science or media rendering.
    """

    _validate_grade_action_shape(action)
    return _run_production_action(
        workspace_root,
        trusted_plan=trusted_plan,
        action=action,
        started_at=started_at,
        completed_at=completed_at,
        expected_adapter=_GRADE_PRODUCTION_ADAPTER,
        materialize_outputs=_materialize_grade_production_outputs,
        retryable_error_message=_grade_retryable_error_message,
        result_type=GradeProductionAdapterResult,
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
) -> ProductionAdapterResult:
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
        raise ProductionAdapterError(str(exc)) from exc
    compare_and_write_production_job_status(
        root,
        trusted_plan=trusted_plan,
        updated_status=running_status,
        expected_state=current_status.state,
        expected_attempts=current_status.attempts,
        expected_updated_at=current_status.updated_at,
    )

    try:
        outputs_materialized = materialize_outputs(action, root, trusted_plan=trusted_plan)
        final_status = report_production_worker_success(
            running_status,
            action,
            root,
            updated_at=completed_at,
        )
    except (ProductionAdapterError, ProductionWorkerError) as exc:
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
    *,
    trusted_plan: ProductionPlan | None = None,
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
    *,
    trusted_plan: ProductionPlan | None = None,
) -> tuple[str, ...]:
    """Create deterministic metadata JSON from trusted workspace inputs."""

    _validate_action(action, expected_adapter=_METADATA_PRODUCTION_ADAPTER)
    root = _workspace_root(workspace_root)
    input_metadata = _metadata_for_inputs(root, action)
    materialized: list[str] = []
    for output in action.outputs:
        _write_metadata_output(root, action=action, output=output, input_metadata=input_metadata)
        materialized.append(output)
    return tuple(materialized)


def _materialize_proxy_production_outputs(
    action: ProductionWorkerAction,
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan | None = None,
) -> tuple[str, ...]:
    """Create byte-identical local proxy stand-ins from trusted workspace inputs."""

    _validate_proxy_action_shape(action)
    root = _workspace_root(workspace_root)
    materialized: list[str] = []
    for output in action.outputs:
        _copy_proxy_output(root, input_ref=action.inputs[0], output=output)
        materialized.append(output)
    return tuple(materialized)


def _materialize_analysis_production_outputs(
    action: ProductionWorkerAction,
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan | None = None,
) -> tuple[str, ...]:
    """Create deterministic, loader-compatible per-asset analysis JSON."""

    _validate_analysis_action_shape(action)
    if trusted_plan is None:
        raise ProductionAdapterError("analysis production adapter requires a trusted plan")
    root = _workspace_root(workspace_root)
    input_metadata = _metadata_for_input(
        root,
        action.inputs[0],
        allow_logical=False,
        label="analysis production input",
    )
    media_type = _analysis_media_type_from_plan(action, trusted_plan=trusted_plan)
    materialized: list[str] = []
    for output in action.outputs:
        _write_analysis_output(
            root,
            action=action,
            output=output,
            input_metadata=input_metadata,
            media_type=media_type,
        )
        materialized.append(output)
    return tuple(materialized)


def _materialize_scene_production_outputs(
    action: ProductionWorkerAction,
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan | None = None,
) -> tuple[str, ...]:
    """Create deterministic scene-grouping JSON from trusted analysis artifacts."""

    _validate_scene_action_shape(action)
    if trusted_plan is None:
        raise ProductionAdapterError("scene production adapter requires a trusted plan")
    root = _workspace_root(workspace_root)
    _verify_scene_dependency_outputs(root, action=action, trusted_plan=trusted_plan)
    try:
        analyses = load_asset_analyses(trusted_plan, root)
    except AnalysisLoaderError as exc:
        raise ProductionAdapterError(str(exc)) from exc
    content = _scene_output_bytes(action, analyses=analyses)
    materialized: list[str] = []
    for output in action.outputs:
        _write_production_output_bytes(root, output=output, content=content, label="scene production")
        materialized.append(output)
    return tuple(materialized)


def _materialize_look_production_outputs(
    action: ProductionWorkerAction,
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan | None = None,
) -> tuple[str, ...]:
    """Create deterministic shoot-look JSON from a trusted scene-group summary."""

    _validate_look_action_shape(action)
    if trusted_plan is None:
        raise ProductionAdapterError("look production adapter requires a trusted plan")
    root = _workspace_root(workspace_root)
    scene_output = _verify_look_dependency_outputs(root, action=action, trusted_plan=trusted_plan)
    scene_summary = _scene_group_summary(scene_output)
    content = _look_output_bytes(action, scene_summary=scene_summary)
    materialized: list[str] = []
    for output in action.outputs:
        _write_production_output_bytes(root, output=output, content=content, label="look production")
        materialized.append(output)
    return tuple(materialized)


def _materialize_grade_production_outputs(
    action: ProductionWorkerAction,
    workspace_root: Path | str,
    *,
    trusted_plan: ProductionPlan | None = None,
) -> tuple[str, ...]:
    """Create deterministic graded-output stand-ins from trusted dependencies."""

    _validate_grade_action_shape(action)
    if trusted_plan is None:
        raise ProductionAdapterError("grade production adapter requires a trusted plan")
    root = _workspace_root(workspace_root)
    source_metadata = _metadata_for_input(
        root,
        action.inputs[0],
        allow_logical=False,
        label="grade production source input",
    )
    dependency_summary = _verify_grade_dependency_outputs(root, action=action, trusted_plan=trusted_plan)
    content = _grade_output_bytes(
        action,
        source_metadata=source_metadata,
        dependency_summary=dependency_summary,
    )
    materialized: list[str] = []
    for output in action.outputs:
        _write_production_output_bytes(root, output=output, content=content, label="grade production")
        materialized.append(output)
    return tuple(materialized)


def _validate_proxy_action_shape(action: ProductionWorkerAction) -> None:
    _validate_action(action, expected_adapter=_PROXY_PRODUCTION_ADAPTER)
    if action.output_kind != "proxy_media":
        raise ProductionAdapterError(
            "Proxy production adapter only materializes proxy_media jobs: "
            f"{action.output_kind}"
        )
    if len(action.inputs) != 1:
        raise ProductionAdapterError("Proxy production adapter requires exactly one input")


def _validate_analysis_action_shape(action: ProductionWorkerAction) -> None:
    _validate_action(action, expected_adapter=_ANALYSIS_PRODUCTION_ADAPTER)
    if action.output_kind != "vlm_asset_analysis":
        raise ProductionAdapterError(
            "Analysis production adapter only materializes vlm_asset_analysis jobs: "
            f"{action.output_kind}"
        )
    if len(action.inputs) != 1:
        raise ProductionAdapterError("Analysis production adapter requires exactly one input")
    if len(action.outputs) != 1:
        raise ProductionAdapterError("Analysis production adapter requires exactly one output")
    output_path = Path(action.outputs[0])
    if (
        len(output_path.parts) != 2
        or output_path.parts[0] != "analysis"
        or not output_path.name.endswith(".json")
        or not output_path.stem.isdigit()
        or len(output_path.stem) != 5
    ):
        raise ProductionAdapterError(
            "Analysis production adapter requires analysis/00000.json-style output: "
            f"{action.outputs[0]}"
        )


def _validate_scene_action_shape(action: ProductionWorkerAction) -> None:
    _validate_action(action, expected_adapter=_SCENE_PRODUCTION_ADAPTER)
    if action.output_kind != "scene_grouping":
        raise ProductionAdapterError(
            "Scene production adapter only materializes scene_grouping jobs: "
            f"{action.output_kind}"
        )
    if action.can_run_in_parallel:
        raise ProductionAdapterError("Scene production adapter requires a serial action")
    if len(action.outputs) != 1 or action.outputs[0] != "analysis/scene_groups.json":
        raise ProductionAdapterError(
            "Scene production adapter requires analysis/scene_groups.json output"
        )


def _validate_look_action_shape(action: ProductionWorkerAction) -> None:
    _validate_action(action, expected_adapter=_LOOK_PRODUCTION_ADAPTER)
    if action.output_kind != "look_development":
        raise ProductionAdapterError(
            "Look production adapter only materializes look_development jobs: "
            f"{action.output_kind}"
        )
    if action.can_run_in_parallel:
        raise ProductionAdapterError("Look production adapter requires a serial action")
    if len(action.inputs) != 1:
        raise ProductionAdapterError("Look production adapter requires exactly one logical shoot input")
    if len(action.outputs) != 1 or action.outputs[0] != "color/shoot_look.json":
        raise ProductionAdapterError(
            "Look production adapter requires color/shoot_look.json output"
        )


def _validate_grade_action_shape(action: ProductionWorkerAction) -> None:
    _validate_action(action, expected_adapter=_GRADE_PRODUCTION_ADAPTER)
    if action.output_kind not in {"graded_photo", "graded_video"}:
        raise ProductionAdapterError(
            "Grade production adapter only materializes graded_photo or graded_video jobs: "
            f"{action.output_kind}"
        )
    if len(action.inputs) != 1:
        raise ProductionAdapterError("Grade production adapter requires exactly one source input")
    if len(action.outputs) != 1:
        raise ProductionAdapterError("Grade production adapter requires exactly one graded output")
    output_path = Path(action.outputs[0])
    expected_name = Path(action.inputs[0]).name
    if (
        len(output_path.parts) != 3
        or output_path.parts[0] != "graded"
        or output_path.parts[1] != action.job_id
        or output_path.name != expected_name
    ):
        raise ProductionAdapterError(
            "Grade production adapter requires graded/<job_id>/<source-name> output: "
            f"{action.outputs[0]}"
        )


def _verify_scene_dependency_outputs(
    root: Path,
    *,
    action: ProductionWorkerAction,
    trusted_plan: ProductionPlan,
) -> None:
    manifest = load_production_status_manifest(root, trusted_plan=trusted_plan)
    statuses = {status.job_id: status for status in manifest.job_statuses}
    jobs = {job.job_id: job for job in trusted_plan.jobs}
    for dependency_id in action.depends_on:
        try:
            dependency_job = jobs[dependency_id]
            dependency_status = statuses[dependency_id]
        except KeyError as exc:
            raise ProductionAdapterError(
                f"Scene production dependency is missing from trusted status: {dependency_id}"
            ) from exc
        if dependency_job.output_kind != "vlm_asset_analysis":
            raise ProductionAdapterError(
                "Scene production adapter only consumes analysis dependencies: "
                f"{dependency_id}"
            )
        if dependency_status.state != "succeeded":
            raise ProductionAdapterError(
                f"Scene production dependency is not succeeded: {dependency_id}"
            )
        expected_checksums = {
            checksum.path: checksum.sha256 for checksum in dependency_status.output_checksums
        }
        if set(expected_checksums) != set(dependency_job.outputs):
            raise ProductionAdapterError(
                f"Scene production dependency checksums do not match planned outputs: {dependency_id}"
            )
        for output in dependency_job.outputs:
            output_path = _workspace_output_path(root, output)
            _reject_symlink_path(output_path.parent, root, "scene production dependency output directory")
            _reject_symlink_path(output_path, root, "scene production dependency output")
            if not output_path.is_file():
                raise ProductionAdapterError(
                    f"Missing scene production dependency output: {output}"
                )
            actual_sha256 = _sha256_file(output_path, label="scene production dependency output")
            if actual_sha256 != expected_checksums[output]:
                raise ProductionAdapterError(
                    f"Scene production dependency checksum mismatch: {output}"
                )


def _verify_look_dependency_outputs(
    root: Path,
    *,
    action: ProductionWorkerAction,
    trusted_plan: ProductionPlan,
) -> tuple[str, str, bytes, ProductionJob]:
    manifest = load_production_status_manifest(root, trusted_plan=trusted_plan)
    statuses = {status.job_id: status for status in manifest.job_statuses}
    jobs = {job.job_id: job for job in trusted_plan.jobs}
    if len(action.depends_on) != 1:
        raise ProductionAdapterError("Look production adapter requires exactly one scene_grouping dependency")
    dependency_id = action.depends_on[0]
    try:
        dependency_job = jobs[dependency_id]
        dependency_status = statuses[dependency_id]
    except KeyError as exc:
        raise ProductionAdapterError(
            f"Look production dependency is missing from trusted status: {dependency_id}"
        ) from exc
    if dependency_job.output_kind != "scene_grouping":
        raise ProductionAdapterError(
            "Look production adapter only consumes scene_grouping dependencies: "
            f"{dependency_job.output_kind}"
        )
    if dependency_job.outputs != ("analysis/scene_groups.json",):
        raise ProductionAdapterError(
            "Look production dependency requires analysis/scene_groups.json output"
        )
    if dependency_status.state != "succeeded":
        raise ProductionAdapterError(
            f"Look production dependency is not succeeded: {dependency_job.job_id}"
        )
    expected_checksums = {
        checksum.path: checksum.sha256 for checksum in dependency_status.output_checksums
    }
    if set(expected_checksums) != set(dependency_job.outputs):
        raise ProductionAdapterError(
            f"Look production dependency checksums do not match planned outputs: {dependency_job.job_id}"
        )
    output = dependency_job.outputs[0]
    output_path = _workspace_output_path(root, output)
    _reject_symlink_path(output_path.parent, root, "look production dependency output directory")
    _reject_symlink_path(output_path, root, "look production dependency output")
    if not output_path.is_file():
        raise ProductionAdapterError(f"Missing look production dependency output: {output}")
    content, actual_sha256 = _read_file_bytes_and_sha256(
        output_path,
        label="look production dependency output",
    )
    if actual_sha256 != expected_checksums[output]:
        raise ProductionAdapterError(f"Look production dependency checksum mismatch: {output}")
    return output, actual_sha256, content, dependency_job


def _verify_grade_dependency_outputs(
    root: Path,
    *,
    action: ProductionWorkerAction,
    trusted_plan: ProductionPlan,
) -> dict[str, dict[str, object]]:
    manifest = load_production_status_manifest(root, trusted_plan=trusted_plan)
    statuses = {status.job_id: status for status in manifest.job_statuses}
    jobs = {job.job_id: job for job in trusted_plan.jobs}
    if len(action.depends_on) != 2:
        raise ProductionAdapterError("Grade production adapter requires analysis and look dependencies")

    analysis_summary: dict[str, object] | None = None
    look_summary: dict[str, object] | None = None
    for dependency_id in action.depends_on:
        try:
            dependency_job = jobs[dependency_id]
            dependency_status = statuses[dependency_id]
        except KeyError as exc:
            raise ProductionAdapterError(
                f"Grade production dependency is missing from trusted status: {dependency_id}"
            ) from exc
        if dependency_status.state != "succeeded":
            raise ProductionAdapterError(
                f"Grade production dependency is not succeeded: {dependency_id}"
            )
        output, actual_sha256, content = _verified_dependency_output(
            root,
            dependency_job=dependency_job,
            dependency_status=dependency_status,
            label="grade production dependency output",
        )
        if dependency_job.output_kind == "vlm_asset_analysis":
            analysis_summary = _grade_analysis_summary(
                action,
                output=output,
                sha256=actual_sha256,
                content=content,
                dependency_job=dependency_job,
            )
        elif dependency_job.output_kind == "look_development":
            look_summary = _grade_look_summary(
                output=output,
                sha256=actual_sha256,
                content=content,
                dependency_job=dependency_job,
            )
        else:
            raise ProductionAdapterError(
                "Grade production adapter only consumes analysis and look dependencies: "
                f"{dependency_job.output_kind}"
            )

    if analysis_summary is None or look_summary is None:
        raise ProductionAdapterError("Grade production adapter requires one analysis and one look dependency")
    return {"analysis": analysis_summary, "look": look_summary}


def _verified_dependency_output(
    root: Path,
    *,
    dependency_job: ProductionJob,
    dependency_status: ProductionJobStatus,
    label: str,
) -> tuple[str, str, bytes]:
    expected_checksums = {
        checksum.path: checksum.sha256 for checksum in dependency_status.output_checksums
    }
    if len(dependency_job.outputs) != 1 or set(expected_checksums) != set(dependency_job.outputs):
        raise ProductionAdapterError(
            f"Grade production dependency checksums do not match planned outputs: {dependency_job.job_id}"
        )
    output = dependency_job.outputs[0]
    output_path = _workspace_output_path(root, output)
    _reject_symlink_path(output_path.parent, root, f"{label} directory")
    _reject_symlink_path(output_path, root, label)
    if not output_path.is_file():
        raise ProductionAdapterError(f"Missing grade production dependency output: {output}")
    content, actual_sha256 = _read_file_bytes_and_sha256(output_path, label=label)
    if actual_sha256 != expected_checksums[output]:
        raise ProductionAdapterError(f"Grade production dependency checksum mismatch: {output}")
    return output, actual_sha256, content


def _validate_action(
    action: ProductionWorkerAction,
    *,
    expected_adapter: str | None = None,
) -> None:
    if not isinstance(action, ProductionWorkerAction):
        raise ProductionAdapterError("action must be a ProductionWorkerAction")
    if not isinstance(action.worker_adapter, str) or not action.worker_adapter.strip():
        raise ProductionAdapterError("production action worker_adapter cannot be empty")
    if expected_adapter is not None and action.worker_adapter != expected_adapter:
        raise ProductionAdapterError(
            "production action worker_adapter must be "
            f"{expected_adapter}: {action.worker_adapter}"
        )
    if not isinstance(action.outputs, tuple) or not action.outputs:
        raise ProductionAdapterError("production action must declare at least one output")
    seen_outputs: set[str] = set()
    for output in action.outputs:
        _validate_production_output_path(output)
        if output in seen_outputs:
            raise ProductionAdapterError(f"production action has duplicate output: {output}")
        seen_outputs.add(output)


def _validate_action_matches_trusted_plan(
    action: ProductionWorkerAction,
    *,
    trusted_plan: ProductionPlan,
) -> None:
    if not isinstance(trusted_plan, ProductionPlan):
        raise ProductionAdapterError("trusted_plan must be a ProductionPlan")
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
            raise ProductionAdapterError(
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
    raise ProductionAdapterError(f"production action references unknown trusted job: {action.job_id}")


def _validate_action_plan(
    action_plan: ProductionWorkerActionPlan,
    *,
    trusted_plan: ProductionPlan,
    expected_adapter: str | None = None,
) -> None:
    if not isinstance(trusted_plan, ProductionPlan):
        raise ProductionAdapterError("trusted_plan must be a ProductionPlan")
    if not isinstance(action_plan, ProductionWorkerActionPlan):
        raise ProductionAdapterError("action_plan must be a ProductionWorkerActionPlan")
    if not isinstance(action_plan.shoot_slug, str) or not action_plan.shoot_slug.strip():
        raise ProductionAdapterError("production action plan shoot_slug cannot be empty")
    if action_plan.shoot_slug != trusted_plan.shoot_slug:
        raise ProductionAdapterError("production action plan shoot_slug does not match trusted plan")
    if not isinstance(action_plan.worker_adapter, str) or not action_plan.worker_adapter.strip():
        raise ProductionAdapterError("production action plan worker_adapter cannot be empty")
    if expected_adapter is not None and action_plan.worker_adapter != expected_adapter:
        raise ProductionAdapterError(
            "production action plan worker_adapter must be "
            f"{expected_adapter}: {action_plan.worker_adapter}"
        )
    if not isinstance(action_plan.actions, tuple):
        raise ProductionAdapterError("production action plan actions must be a tuple")
    if not isinstance(action_plan.blocked_jobs, tuple):
        raise ProductionAdapterError("production action plan blocked_jobs must be a tuple")

    trusted_jobs = {job.job_id: job for job in trusted_plan.jobs}
    seen_job_ids: set[str] = set()
    for action in action_plan.actions:
        _validate_action(action, expected_adapter=expected_adapter)
        _validate_action_matches_trusted_plan(action, trusted_plan=trusted_plan)
        if action.worker_adapter != action_plan.worker_adapter:
            raise ProductionAdapterError("production action adapter does not match action plan")
        if action.job_id in seen_job_ids:
            raise ProductionAdapterError(f"production action plan has duplicate action: {action.job_id}")
        seen_job_ids.add(action.job_id)
    for blocked_job in action_plan.blocked_jobs:
        if not isinstance(blocked_job.job_id, str) or not blocked_job.job_id.strip():
            raise ProductionAdapterError("production action plan blocked job_id cannot be empty")
        if blocked_job.job_id not in trusted_jobs:
            raise ProductionAdapterError(
                f"production action plan blocked unknown job: {blocked_job.job_id}"
            )


def _validate_max_concurrency(max_concurrency: int) -> None:
    if (
        isinstance(max_concurrency, bool)
        or not isinstance(max_concurrency, int)
        or max_concurrency < 1
    ):
        raise ProductionAdapterError("production adapter batch max_concurrency must be a positive integer")


def _validate_timestamp(timestamp: str, label: str) -> None:
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise ProductionAdapterError(f"production adapter {label} must be a non-empty string")
    if len(timestamp) > 80 or "\x00" in timestamp or "\n" in timestamp or "\r" in timestamp:
        raise ProductionAdapterError(f"production adapter {label} is invalid")


def _workspace_root(workspace_root: Path | str) -> Path:
    root = Path(workspace_root)
    if root.is_symlink():
        raise ProductionAdapterError(f"Refusing production adapter workspace symlink: {root}")
    return root


def _status_for_action(
    manifest: ProductionStatusManifest,
    action: ProductionWorkerAction,
) -> ProductionJobStatus:
    for status in manifest.job_statuses:
        if status.job_id == action.job_id:
            return status
    raise ProductionAdapterError(f"Missing production status for action: {action.job_id}")


def _write_dry_run_output(
    root: Path,
    *,
    action: ProductionWorkerAction,
    output: str,
) -> None:
    if output.endswith("/"):
        raise ProductionAdapterError(
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
        raise ProductionAdapterError(
            "Metadata production adapter does not materialize directory-style output: "
            f"{output}"
        )
    content = _metadata_output_bytes(action, output=output, input_metadata=input_metadata)
    _write_production_output_bytes(root, output=output, content=content, label="metadata production")


def _write_analysis_output(
    root: Path,
    *,
    action: ProductionWorkerAction,
    output: str,
    input_metadata: dict[str, object],
    media_type: str,
) -> None:
    content = _analysis_output_bytes(
        action,
        output=output,
        input_metadata=input_metadata,
        media_type=media_type,
    )
    _write_production_output_bytes(root, output=output, content=content, label="analysis production")


def _copy_proxy_output(
    root: Path,
    *,
    input_ref: str,
    output: str,
) -> None:
    if output.endswith("/"):
        raise ProductionAdapterError(
            "Proxy production adapter does not materialize directory-style output: "
            f"{output}"
        )
    input_path = _workspace_input_path(root, input_ref, label="proxy production input")
    _reject_symlink_path(input_path.parent, root, "proxy production input directory")
    _reject_symlink_path(input_path, root, "proxy production input")

    output_path = _workspace_output_path(root, output)
    _reject_symlink_path(output_path.parent, root, "proxy production output directory")
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ProductionAdapterError(
            f"Unable to create proxy production output directory: {output_path.parent}"
        ) from exc
    _reject_symlink_path(output_path.parent, root, "proxy production output directory")
    _reject_symlink_path(output_path, root, "proxy production output")

    if output_path.exists():
        expected_sha256 = _sha256_proxy_input(input_path, input_ref=input_ref)
        _validate_existing_output(
            output_path,
            output=output,
            expected_sha256=expected_sha256,
            label="proxy production output",
        )
        return

    temp_path = output_path.with_name(f".{output_path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    _reject_symlink_path(temp_path, root, "temporary proxy production output")
    input_flags = os.O_RDONLY
    output_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        input_flags |= os.O_NOFOLLOW
        output_flags |= os.O_NOFOLLOW

    try:
        input_fd = os.open(input_path, input_flags)
    except FileNotFoundError as exc:
        raise ProductionAdapterError(f"Missing proxy production input: {input_ref}") from exc
    except OSError as exc:
        raise ProductionAdapterError(f"Unable to open proxy production input: {input_ref}") from exc

    try:
        output_fd = os.open(temp_path, output_flags, 0o600)
    except OSError as exc:
        os.close(input_fd)
        raise ProductionAdapterError(f"Unable to create temporary proxy production output: {temp_path}") from exc

    digest = hashlib.sha256()
    try:
        with os.fdopen(input_fd, "rb") as input_file, os.fdopen(output_fd, "wb") as temp_file:
            input_stat = os.fstat(input_file.fileno())
            if not stat.S_ISREG(input_stat.st_mode):
                raise ProductionAdapterError(f"Refusing non-file proxy production input: {input_ref}")
            for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
                digest.update(chunk)
                temp_file.write(chunk)
        _reject_symlink_path(temp_path, root, "temporary proxy production output")
        expected_sha256 = digest.hexdigest()
        try:
            os.link(temp_path, output_path)
        except FileExistsError:
            _validate_existing_output(
                output_path,
                output=output,
                expected_sha256=expected_sha256,
                label="proxy production output",
            )
        except OSError as exc:
            raise ProductionAdapterError(f"Unable to commit proxy production output: {output}") from exc
    except OSError as exc:
        raise ProductionAdapterError(f"Unable to write proxy production output: {output}") from exc
    finally:
        try:
            temp_path.unlink()
        except FileNotFoundError:
            pass


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
        raise ProductionAdapterError(
            f"Unable to create {label} output directory: {output_path.parent}"
        ) from exc
    _reject_symlink_path(output_path.parent, root, f"{label} output directory")
    _reject_symlink_path(output_path, root, f"{label} output")

    if output_path.exists():
        _validate_existing_output(
            output_path,
            output=output,
            expected_sha256=expected_sha256,
            label=f"{label} output",
        )
        return

    temp_path = output_path.with_name(f".{output_path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    _reject_symlink_path(temp_path, root, f"temporary {label} output")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW

    try:
        fd = os.open(temp_path, flags, 0o600)
    except OSError as exc:
        raise ProductionAdapterError(f"Unable to create temporary {label} output: {temp_path}") from exc

    try:
        with os.fdopen(fd, "wb") as temp_file:
            temp_file.write(content)
        _reject_symlink_path(temp_path, root, f"temporary {label} output")
        try:
            os.link(temp_path, output_path)
        except FileExistsError:
            _validate_existing_output(
                output_path,
                output=output,
                expected_sha256=expected_sha256,
                label=f"{label} output",
            )
        except OSError as exc:
            raise ProductionAdapterError(f"Unable to commit {label} output: {output}") from exc
    except OSError as exc:
        raise ProductionAdapterError(f"Unable to write {label} output: {output}") from exc
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
        "adapter": "shootflow-metadata-production-local",
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


def _analysis_output_bytes(
    action: ProductionWorkerAction,
    *,
    output: str,
    input_metadata: dict[str, object],
    media_type: str,
) -> bytes:
    sha256 = input_metadata["sha256"]
    if not isinstance(sha256, str):
        raise ProductionAdapterError("analysis production input metadata is missing sha256")
    payload: dict[str, object] = {
        "schema_version": 1,
        "adapter": "shootflow-analysis-production-local",
        "source_asset_path": action.inputs[0],
        "media_type": media_type,
        "scene_label": f"local_scene_{action.job_id.removeprefix('analyze_asset_')}",
        "aesthetic_score": _analysis_score(sha256, offset=0),
        "story_score": _analysis_score(sha256, offset=4),
        "technical_score": _analysis_score(sha256, offset=8),
        "motion_score": _analysis_score(sha256, offset=12),
        "tags": ("local_analysis_probe", media_type),
        "adapter_metadata": {
            "job_id": action.job_id,
            "output_kind": action.output_kind,
            "outputs": action.outputs,
            "selected_output": output,
            "depends_on": action.depends_on,
            "can_run_in_parallel": action.can_run_in_parallel,
            "input_metadata": input_metadata,
        },
    }
    if media_type == "video":
        payload["duration_seconds"] = 0.0
    return (json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _scene_output_bytes(action: ProductionWorkerAction, *, analyses) -> bytes:
    groups: dict[str, list] = {}
    for analysis in analyses:
        groups.setdefault(analysis.scene_label, []).append(analysis)

    scene_groups = []
    for scene_label in sorted(groups):
        scene_analyses = sorted(groups[scene_label], key=lambda item: item.asset_path)
        tags = sorted({tag for analysis in scene_analyses for tag in analysis.tags})
        scene_groups.append(
            {
                "scene_label": scene_label,
                "asset_count": len(scene_analyses),
                "video_count": sum(1 for analysis in scene_analyses if analysis.media_type == "video"),
                "photo_count": sum(1 for analysis in scene_analyses if analysis.media_type == "photo"),
                "asset_paths": [analysis.asset_path for analysis in scene_analyses],
                "primary_tags": tags,
                "average_aesthetic_score": _average_score(
                    analysis.aesthetic_score for analysis in scene_analyses
                ),
                "average_story_score": _average_score(
                    analysis.story_score for analysis in scene_analyses
                ),
                "average_technical_score": _average_score(
                    analysis.technical_score for analysis in scene_analyses
                ),
                "average_motion_score": _average_score(
                    analysis.motion_score for analysis in scene_analyses
                ),
            }
        )

    payload = {
        "schema_version": 1,
        "adapter": "shootflow-scene-production-local",
        "job_id": action.job_id,
        "output_kind": action.output_kind,
        "inputs": list(action.inputs),
        "outputs": list(action.outputs),
        "selected_output": action.outputs[0],
        "depends_on": list(action.depends_on),
        "can_run_in_parallel": action.can_run_in_parallel,
        "analysis_count": len(analyses),
        "scene_count": len(scene_groups),
        "scene_groups": scene_groups,
    }
    return (json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _scene_group_summary(scene_output: tuple[str, str, bytes, ProductionJob]) -> dict[str, object]:
    output, sha256, content, dependency_job = scene_output
    try:
        raw_payload = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProductionAdapterError(f"Invalid look production scene grouping JSON: {output}") from exc
    if not isinstance(raw_payload, dict):
        raise ProductionAdapterError(f"Invalid look production scene grouping payload: {output}")
    expected_fields: tuple[tuple[str, object], ...] = (
        ("adapter", "shootflow-scene-production-local"),
        ("job_id", dependency_job.job_id),
        ("output_kind", "scene_grouping"),
        ("inputs", list(dependency_job.inputs)),
        ("outputs", list(dependency_job.outputs)),
        ("selected_output", dependency_job.outputs[0]),
        ("depends_on", list(dependency_job.depends_on)),
        ("can_run_in_parallel", dependency_job.can_run_in_parallel),
    )
    for field_name, expected_value in expected_fields:
        if raw_payload.get(field_name) != expected_value:
            raise ProductionAdapterError(
                f"Look production scene grouping {field_name} does not match trusted plan"
            )
    schema_version = raw_payload.get("schema_version")
    if not isinstance(schema_version, int) or isinstance(schema_version, bool) or schema_version != 1:
        raise ProductionAdapterError("Look production requires scene grouping schema_version 1")
    scene_groups = raw_payload.get("scene_groups")
    if not isinstance(scene_groups, list):
        raise ProductionAdapterError("Look production scene_groups must be a list")
    declared_scene_count = raw_payload.get("scene_count")
    if (
        not isinstance(declared_scene_count, int)
        or isinstance(declared_scene_count, bool)
        or declared_scene_count != len(scene_groups)
    ):
        raise ProductionAdapterError("Look production scene_count does not match scene_groups")
    primary_tags: set[str] = set()
    scene_labels: list[str] = []
    total_asset_count = 0
    for scene_group in scene_groups:
        if not isinstance(scene_group, dict):
            raise ProductionAdapterError("Look production scene group must be an object")
        scene_label = scene_group.get("scene_label")
        if not isinstance(scene_label, str) or not scene_label.strip():
            raise ProductionAdapterError("Look production scene_label cannot be empty")
        scene_labels.append(scene_label)
        asset_count = _scene_group_non_negative_int(scene_group, "asset_count")
        video_count = _scene_group_non_negative_int(scene_group, "video_count")
        photo_count = _scene_group_non_negative_int(scene_group, "photo_count")
        if video_count + photo_count != asset_count:
            raise ProductionAdapterError("Look production scene media counts do not match asset_count")
        asset_paths = scene_group.get("asset_paths")
        if not isinstance(asset_paths, list):
            raise ProductionAdapterError("Look production asset_paths must be a list")
        if len(asset_paths) != asset_count:
            raise ProductionAdapterError("Look production asset_count does not match asset_paths")
        for asset_path in asset_paths:
            if not isinstance(asset_path, str) or not asset_path.strip():
                raise ProductionAdapterError("Look production asset_paths must contain strings")
        for score_field in (
            "average_aesthetic_score",
            "average_story_score",
            "average_technical_score",
            "average_motion_score",
        ):
            _scene_group_score(scene_group, score_field)
        raw_tags = scene_group.get("primary_tags", [])
        if not isinstance(raw_tags, list):
            raise ProductionAdapterError("Look production primary_tags must be a list")
        for tag in raw_tags:
            if not isinstance(tag, str) or not tag.strip():
                raise ProductionAdapterError("Look production primary_tags must contain strings")
            primary_tags.add(tag)
        total_asset_count += asset_count
    analysis_count = raw_payload.get("analysis_count")
    if (
        not isinstance(analysis_count, int)
        or isinstance(analysis_count, bool)
        or analysis_count != total_asset_count
    ):
        raise ProductionAdapterError("Look production analysis_count does not match scene asset counts")
    return {
        "path": output,
        "sha256": sha256,
        "analysis_count": analysis_count,
        "scene_count": len(scene_groups),
        "scene_labels": sorted(scene_labels),
        "primary_tags": sorted(primary_tags),
    }


def _scene_group_non_negative_int(scene_group: dict[str, object], field_name: str) -> int:
    value = scene_group.get(field_name)
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ProductionAdapterError(f"Look production {field_name} must be a non-negative integer")
    return value


def _scene_group_score(scene_group: dict[str, object], field_name: str) -> float:
    value = scene_group.get(field_name)
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ProductionAdapterError(f"Look production {field_name} must be a score")
    score = float(value)
    if not math.isfinite(score):
        raise ProductionAdapterError(f"Look production {field_name} must be finite")
    if score < 0.0 or score > 1.0:
        raise ProductionAdapterError(f"Look production {field_name} must be between 0 and 1")
    return score


def _grade_analysis_summary(
    action: ProductionWorkerAction,
    *,
    output: str,
    sha256: str,
    content: bytes,
    dependency_job: ProductionJob,
) -> dict[str, object]:
    try:
        raw_payload = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProductionAdapterError(f"Invalid grade production analysis JSON: {output}") from exc
    if not isinstance(raw_payload, dict):
        raise ProductionAdapterError(f"Invalid grade production analysis payload: {output}")
    schema_version = raw_payload.get("schema_version")
    if not isinstance(schema_version, int) or isinstance(schema_version, bool) or schema_version != 1:
        raise ProductionAdapterError("Grade production requires analysis schema_version 1")
    if raw_payload.get("adapter") != "shootflow-analysis-production-local":
        raise ProductionAdapterError("Grade production analysis adapter does not match trusted local adapter")
    adapter_metadata = raw_payload.get("adapter_metadata")
    if not isinstance(adapter_metadata, dict):
        raise ProductionAdapterError("Grade production analysis adapter_metadata must be an object")
    expected_metadata: tuple[tuple[str, object], ...] = (
        ("job_id", dependency_job.job_id),
        ("output_kind", "vlm_asset_analysis"),
        ("outputs", list(dependency_job.outputs)),
        ("selected_output", output),
        ("depends_on", list(dependency_job.depends_on)),
        ("can_run_in_parallel", dependency_job.can_run_in_parallel),
    )
    for field_name, expected_value in expected_metadata:
        if adapter_metadata.get(field_name) != expected_value:
            raise ProductionAdapterError(
                f"Grade production analysis {field_name} does not match trusted plan"
            )
    source_asset_path = raw_payload.get("source_asset_path")
    if source_asset_path != action.inputs[0] or dependency_job.inputs != action.inputs:
        raise ProductionAdapterError("Grade production analysis source does not match trusted job")
    media_type = raw_payload.get("media_type")
    expected_media_type = action.output_kind.removeprefix("graded_")
    if media_type != expected_media_type:
        raise ProductionAdapterError("Grade production analysis media_type does not match graded output")
    return {
        "path": output,
        "sha256": sha256,
        "media_type": media_type,
        "scene_label": raw_payload.get("scene_label", ""),
        "aesthetic_score": _grade_score(raw_payload, "aesthetic_score"),
        "story_score": _grade_score(raw_payload, "story_score"),
        "technical_score": _grade_score(raw_payload, "technical_score"),
        "motion_score": _grade_score(raw_payload, "motion_score"),
    }


def _grade_look_summary(
    *,
    output: str,
    sha256: str,
    content: bytes,
    dependency_job: ProductionJob,
) -> dict[str, object]:
    try:
        raw_payload = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProductionAdapterError(f"Invalid grade production look JSON: {output}") from exc
    if not isinstance(raw_payload, dict):
        raise ProductionAdapterError(f"Invalid grade production look payload: {output}")
    schema_version = raw_payload.get("schema_version")
    if not isinstance(schema_version, int) or isinstance(schema_version, bool) or schema_version != 1:
        raise ProductionAdapterError("Grade production requires look schema_version 1")
    expected_fields: tuple[tuple[str, object], ...] = (
        ("adapter", "shootflow-look-production-local"),
        ("job_id", dependency_job.job_id),
        ("output_kind", "look_development"),
        ("inputs", list(dependency_job.inputs)),
        ("outputs", list(dependency_job.outputs)),
        ("selected_output", dependency_job.outputs[0]),
        ("depends_on", list(dependency_job.depends_on)),
        ("can_run_in_parallel", dependency_job.can_run_in_parallel),
    )
    for field_name, expected_value in expected_fields:
        if raw_payload.get(field_name) != expected_value:
            raise ProductionAdapterError(
                f"Grade production look {field_name} does not match trusted plan"
            )
    look_profile = raw_payload.get("look_profile")
    if not isinstance(look_profile, dict):
        raise ProductionAdapterError("Grade production look_profile must be an object")
    look_name = look_profile.get("name")
    if not isinstance(look_name, str) or not look_name.strip():
        raise ProductionAdapterError("Grade production look_profile name cannot be empty")
    _grade_look_source_scene_summary(raw_payload)
    for string_field in ("tone_curve", "color_bias"):
        _grade_look_profile_string(look_profile, string_field)
    for score_field in ("warmth", "saturation", "contrast"):
        _grade_look_profile_score(look_profile, score_field)
    return {
        "path": output,
        "sha256": sha256,
        "look_profile_name": look_name,
    }


def _grade_look_source_scene_summary(raw_payload: dict[str, object]) -> None:
    source_scene_groups = raw_payload.get("source_scene_groups")
    if not isinstance(source_scene_groups, dict):
        raise ProductionAdapterError("Grade production source_scene_groups must be an object")
    path = source_scene_groups.get("path")
    if not isinstance(path, str) or not path.strip():
        raise ProductionAdapterError("Grade production source_scene_groups path cannot be empty")
    sha256 = source_scene_groups.get("sha256")
    if not isinstance(sha256, str) or len(sha256) != 64:
        raise ProductionAdapterError("Grade production source_scene_groups sha256 must be a SHA-256 hex digest")
    if not all(character in "0123456789abcdefABCDEF" for character in sha256):
        raise ProductionAdapterError("Grade production source_scene_groups sha256 must be a SHA-256 hex digest")
    for field_name in ("analysis_count", "scene_count"):
        _grade_look_non_negative_int(source_scene_groups, f"source_scene_groups {field_name}", field_name)
    for field_name in ("scene_labels", "primary_tags"):
        _grade_look_string_list(source_scene_groups, f"source_scene_groups {field_name}", field_name)


def _grade_look_non_negative_int(payload: dict[str, object], label: str, field_name: str) -> int:
    value = payload.get(field_name)
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ProductionAdapterError(f"Grade production {label} must be a non-negative integer")
    return value


def _grade_look_string_list(payload: dict[str, object], label: str, field_name: str) -> tuple[str, ...]:
    value = payload.get(field_name)
    if not isinstance(value, list):
        raise ProductionAdapterError(f"Grade production {label} must be a list")
    strings = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise ProductionAdapterError(f"Grade production {label} must contain strings")
        strings.append(item)
    return tuple(strings)


def _grade_look_profile_string(look_profile: dict[str, object], field_name: str) -> str:
    value = look_profile.get(field_name)
    if not isinstance(value, str) or not value.strip():
        raise ProductionAdapterError(f"Grade production look_profile {field_name} cannot be empty")
    return value


def _grade_look_profile_score(look_profile: dict[str, object], field_name: str) -> float:
    value = look_profile.get(field_name)
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ProductionAdapterError(f"Grade production look_profile {field_name} must be a score")
    score = float(value)
    if not math.isfinite(score):
        raise ProductionAdapterError(f"Grade production look_profile {field_name} must be finite")
    if score < 0.0 or score > 1.0:
        raise ProductionAdapterError(f"Grade production look_profile {field_name} must be between 0 and 1")
    return score


def _grade_score(raw_payload: dict[str, object], field_name: str) -> float:
    value = raw_payload.get(field_name)
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ProductionAdapterError(f"Grade production {field_name} must be a score")
    score = float(value)
    if not math.isfinite(score):
        raise ProductionAdapterError(f"Grade production {field_name} must be finite")
    if score < 0.0 or score > 1.0:
        raise ProductionAdapterError(f"Grade production {field_name} must be between 0 and 1")
    return score


def _look_output_bytes(
    action: ProductionWorkerAction,
    *,
    scene_summary: dict[str, object],
) -> bytes:
    sha256 = scene_summary["sha256"]
    if not isinstance(sha256, str):
        raise ProductionAdapterError("look production scene summary is missing sha256")
    payload = {
        "schema_version": 1,
        "adapter": "shootflow-look-production-local",
        "job_id": action.job_id,
        "output_kind": action.output_kind,
        "inputs": list(action.inputs),
        "outputs": list(action.outputs),
        "selected_output": action.outputs[0],
        "depends_on": list(action.depends_on),
        "can_run_in_parallel": action.can_run_in_parallel,
        "source_scene_groups": scene_summary,
        "look_profile": {
            "name": "local-documentary-neutral",
            "tone_curve": "soft_contrast",
            "color_bias": "warm_highlight_protection",
            "warmth": _analysis_score(sha256, offset=0),
            "saturation": _analysis_score(sha256, offset=4),
            "contrast": _analysis_score(sha256, offset=8),
        },
    }
    return (json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _grade_output_bytes(
    action: ProductionWorkerAction,
    *,
    source_metadata: dict[str, object],
    dependency_summary: dict[str, dict[str, object]],
) -> bytes:
    source_sha256 = source_metadata["sha256"]
    if not isinstance(source_sha256, str):
        raise ProductionAdapterError("grade production source metadata is missing sha256")
    analysis_summary = dependency_summary["analysis"]
    look_summary = dependency_summary["look"]
    payload = {
        "schema_version": 1,
        "adapter": "shootflow-grade-production-local",
        "job_id": action.job_id,
        "output_kind": action.output_kind,
        "inputs": list(action.inputs),
        "outputs": list(action.outputs),
        "selected_output": action.outputs[0],
        "depends_on": list(action.depends_on),
        "can_run_in_parallel": action.can_run_in_parallel,
        "source_asset": source_metadata,
        "source_analysis": analysis_summary,
        "source_look": look_summary,
        "grade_profile": {
            "name": "local-look-application-proof",
            "look_profile_name": look_summary["look_profile_name"],
            "exposure_compensation": _signed_adjustment(source_sha256, offset=0),
            "contrast_compensation": _signed_adjustment(source_sha256, offset=4),
            "saturation_compensation": _signed_adjustment(source_sha256, offset=8),
        },
    }
    return (json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _average_score(scores) -> float:
    values = tuple(float(score) for score in scores)
    if not values:
        return 0.0
    return round(sum(values) / len(values), 6)


def _analysis_score(sha256: str, *, offset: int) -> float:
    sample = sha256[offset : offset + 4]
    if len(sample) != 4:
        raise ProductionAdapterError("analysis production input sha256 is invalid")
    return round(0.5 + (int(sample, 16) / 0xFFFF) * 0.5, 6)


def _signed_adjustment(sha256: str, *, offset: int) -> float:
    sample = sha256[offset : offset + 4]
    if len(sample) != 4:
        raise ProductionAdapterError("grade production input sha256 is invalid")
    return round((int(sample, 16) / 0xFFFF) - 0.5, 6)


def _metadata_for_inputs(root: Path, action: ProductionWorkerAction) -> tuple[dict[str, object], ...]:
    allow_logical_inputs = action.output_kind == "look_development"
    return tuple(
        _metadata_for_input(
            root,
            input_ref,
            allow_logical=allow_logical_inputs,
            label="metadata production input",
        )
        for input_ref in action.inputs
    )


def _metadata_for_input(
    root: Path,
    input_ref: str,
    *,
    allow_logical: bool,
    label: str,
) -> dict[str, object]:
    input_path = _workspace_input_path(root, input_ref, label=label)
    _reject_symlink_path(input_path.parent, root, f"{label} directory")
    _reject_symlink_path(input_path, root, label)
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW

    try:
        fd = os.open(input_path, flags)
    except FileNotFoundError as exc:
        if allow_logical:
            return _logical_input_metadata(input_ref)
        raise ProductionAdapterError(f"Missing {label}: {input_ref}") from exc
    except OSError as exc:
        raise ProductionAdapterError(f"Unable to open {label}: {input_ref}") from exc

    digest = hashlib.sha256()
    try:
        with os.fdopen(fd, "rb") as input_file:
            input_stat = os.fstat(input_file.fileno())
            if not stat.S_ISREG(input_stat.st_mode):
                raise ProductionAdapterError(f"Refusing non-file {label}: {input_ref}")
            for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise ProductionAdapterError(f"Unable to read {label}: {input_ref}") from exc

    return {
        "path": _workspace_display_path(root, input_path, fallback=input_ref),
        "sha256": digest.hexdigest(),
        "size_bytes": input_stat.st_size,
    }


def _sha256_proxy_input(path: Path, *, input_ref: str) -> str:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
    except FileNotFoundError as exc:
        raise ProductionAdapterError(f"Missing proxy production input: {input_ref}") from exc
    except OSError as exc:
        raise ProductionAdapterError(f"Unable to open proxy production input: {input_ref}") from exc

    digest = hashlib.sha256()
    try:
        with os.fdopen(fd, "rb") as input_file:
            input_stat = os.fstat(input_file.fileno())
            if not stat.S_ISREG(input_stat.st_mode):
                raise ProductionAdapterError(f"Refusing non-file proxy production input: {input_ref}")
            for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise ProductionAdapterError(f"Unable to checksum proxy production input: {input_ref}") from exc
    return digest.hexdigest()


def _logical_input_metadata(input_ref: str) -> dict[str, object]:
    encoded = input_ref.encode("utf-8")
    return {
        "path": input_ref,
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "size_bytes": len(encoded),
        "logical": True,
    }


def _analysis_media_type_from_plan(
    action: ProductionWorkerAction,
    *,
    trusted_plan: ProductionPlan,
) -> str:
    media_types: list[str] = []
    for job in trusted_plan.jobs:
        if not job.output_kind.startswith("graded_"):
            continue
        if action.job_id not in job.depends_on:
            continue
        if job.inputs != action.inputs:
            raise ProductionAdapterError(
                "Analysis production adapter found mismatched graded input for "
                f"{action.job_id}"
            )
        media_types.append(job.output_kind.removeprefix("graded_"))
    if len(media_types) != 1:
        raise ProductionAdapterError(
            "Analysis production adapter requires exactly one matching graded job: "
            f"{action.job_id}"
        )
    media_type = media_types[0]
    if media_type not in {"photo", "video"}:
        raise ProductionAdapterError(f"Unsupported analysis production media type: {media_type}")
    return media_type


def _workspace_output_path(root: Path, output: str) -> Path:
    _validate_production_output_path(output)
    output_path = root / output
    try:
        output_path.relative_to(root)
    except ValueError as exc:
        raise ProductionAdapterError(f"Dry-run production output escapes workspace: {output}") from exc
    return output_path


def _workspace_input_path(root: Path, input_ref: str, *, label: str = "metadata production input") -> Path:
    _validate_production_input_path(input_ref, label=label)
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
        raise ProductionAdapterError(f"{label.capitalize()} escapes workspace: {input_ref}") from exc
    return input_path


def _validate_production_output_path(output: str) -> None:
    if not isinstance(output, str) or not output.strip():
        raise ProductionAdapterError("dry-run production output path cannot be empty")
    if _contains_invalid_path_character(output):
        raise ProductionAdapterError(f"Unsafe dry-run production output path: {output!r}")
    output_path = Path(output)
    if output_path.is_absolute() or ".." in output_path.parts:
        raise ProductionAdapterError(f"Unsafe dry-run production output path: {output}")


def _validate_production_input_path(
    input_ref: str,
    *,
    label: str = "metadata production input",
) -> None:
    if not isinstance(input_ref, str) or not input_ref.strip():
        raise ProductionAdapterError(f"{label} path cannot be empty")
    if _contains_invalid_path_character(input_ref):
        raise ProductionAdapterError(f"Unsafe {label} path: {input_ref!r}")
    input_path = Path(input_ref)
    if ".." in input_path.parts:
        raise ProductionAdapterError(f"Unsafe {label} path: {input_ref}")


def _contains_invalid_path_character(value: str) -> bool:
    return "\x00" in value or "\n" in value or "\r" in value


def _path_is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _workspace_display_path(root: Path, path: Path, *, fallback: str) -> str:
    try:
        return path.absolute().relative_to(root.absolute()).as_posix()
    except ValueError:
        return fallback


def _validate_existing_output(
    output_path: Path,
    *,
    output: str,
    expected_sha256: str,
    label: str,
) -> None:
    if not output_path.is_file():
        raise ProductionAdapterError(f"Refusing non-file {label}: {output}")
    if _sha256_file(output_path, label=label) != expected_sha256:
        raise ProductionAdapterError(f"Refusing to overwrite existing different {label}: {output}")


def _sha256_file(path: Path, *, label: str = "dry-run production output") -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as output_file:
            for chunk in iter(lambda: output_file.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise ProductionAdapterError(f"Unable to checksum {label}: {path}") from exc
    return digest.hexdigest()


def _read_file_bytes_and_sha256(
    path: Path,
    *,
    label: str,
) -> tuple[bytes, str]:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
    except FileNotFoundError as exc:
        raise ProductionAdapterError(f"Missing {label}: {path}") from exc
    except OSError as exc:
        raise ProductionAdapterError(f"Unable to open {label}: {path}") from exc

    digest = hashlib.sha256()
    chunks: list[bytes] = []
    try:
        with os.fdopen(fd, "rb") as input_file:
            input_stat = os.fstat(input_file.fileno())
            if not stat.S_ISREG(input_stat.st_mode):
                raise ProductionAdapterError(f"Refusing non-file {label}: {path}")
            for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
                digest.update(chunk)
                chunks.append(chunk)
    except OSError as exc:
        raise ProductionAdapterError(f"Unable to read {label}: {path}") from exc
    return b"".join(chunks), digest.hexdigest()


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    current = path
    while True:
        if current.is_symlink():
            raise ProductionAdapterError(f"Refusing {label} symlink: {current}")
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


def _proxy_retryable_error_message(exc: Exception) -> str:
    detail = str(exc).strip() or exc.__class__.__name__
    if len(detail) > 1500:
        detail = detail[:1497] + "..."
    return (
        "Proxy production adapter could not materialize declared outputs: "
        f"{detail}. No source, analysis, graded, render, or deliverable files were deleted."
    )


def _analysis_retryable_error_message(exc: Exception) -> str:
    detail = str(exc).strip() or exc.__class__.__name__
    if len(detail) > 1500:
        detail = detail[:1497] + "..."
    return (
        "Analysis production adapter could not materialize declared outputs: "
        f"{detail}. No source, analysis, graded, render, or deliverable files were deleted."
    )


def _scene_retryable_error_message(exc: Exception) -> str:
    detail = str(exc).strip() or exc.__class__.__name__
    if len(detail) > 1500:
        detail = detail[:1497] + "..."
    return (
        "Scene production adapter could not materialize declared outputs: "
        f"{detail}. No source, analysis, graded, render, or deliverable files were deleted."
    )


def _look_retryable_error_message(exc: Exception) -> str:
    detail = str(exc).strip() or exc.__class__.__name__
    if len(detail) > 1500:
        detail = detail[:1497] + "..."
    return (
        "Look production adapter could not materialize declared outputs: "
        f"{detail}. No source, analysis, color, graded, render, or deliverable files were deleted."
    )


def _grade_retryable_error_message(exc: Exception) -> str:
    detail = str(exc).strip() or exc.__class__.__name__
    if len(detail) > 1500:
        detail = detail[:1497] + "..."
    return (
        "Grade production adapter could not materialize declared outputs: "
        f"{detail}. No source, analysis, color, graded, render, or deliverable files were deleted."
    )


def _validate_result(result: ProductionAdapterResult) -> None:
    if not isinstance(result, ProductionAdapterResult):
        raise ProductionAdapterError("production adapter returned an invalid result")
    if not isinstance(result.job_id, str) or not result.job_id.strip():
        raise ProductionAdapterError("production adapter result job_id cannot be empty")
    if not isinstance(result.claimed_status, ProductionJobStatus):
        raise ProductionAdapterError("production adapter result claimed_status is invalid")
    if not isinstance(result.final_status, ProductionJobStatus):
        raise ProductionAdapterError("production adapter result final_status is invalid")
    if not isinstance(result.manifest, ProductionStatusManifest):
        raise ProductionAdapterError("production adapter result manifest is invalid")
    if not isinstance(result.outputs_materialized, tuple):
        raise ProductionAdapterError("production adapter result outputs_materialized must be a tuple")
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
) -> tuple[ProductionAdapterResult | None, ProductionAdapterFailure | None]:
    try:
        result = run_action(
            workspace_root,
            trusted_plan=trusted_plan,
            action=action,
            started_at=started_at,
            completed_at=completed_at,
        )
    except (ProductionAdapterError, ProductionWorkerError, ProductionStatusError) as exc:
        return None, ProductionAdapterFailure(
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


def _validate_batch_result(result: ProductionAdapterBatchResult) -> None:
    if not isinstance(result, ProductionAdapterBatchResult):
        raise ProductionAdapterError("production adapter batch result is invalid")
    if not isinstance(result.shoot_slug, str) or not result.shoot_slug.strip():
        raise ProductionAdapterError("production adapter batch result shoot_slug cannot be empty")
    if not isinstance(result.worker_adapter, str) or not result.worker_adapter.strip():
        raise ProductionAdapterError("production adapter batch result worker_adapter cannot be empty")
    _validate_max_concurrency(result.max_concurrency)
    if not isinstance(result.results, tuple):
        raise ProductionAdapterError("production adapter batch results must be a tuple")
    if not isinstance(result.failures, tuple):
        raise ProductionAdapterError("production adapter batch failures must be a tuple")
    if not isinstance(result.blocked_job_ids, tuple):
        raise ProductionAdapterError("production adapter batch blocked_job_ids must be a tuple")
    for action_result in result.results:
        _validate_result(action_result)
    for failure in result.failures:
        if not isinstance(failure, ProductionAdapterFailure):
            raise ProductionAdapterError("production adapter batch failure is invalid")
        if not isinstance(failure.job_id, str) or not failure.job_id.strip():
            raise ProductionAdapterError("production adapter batch failure job_id cannot be empty")
        if not isinstance(failure.error_message, str) or not failure.error_message.strip():
            raise ProductionAdapterError("production adapter batch failure error_message cannot be empty")
    for job_id in result.blocked_job_ids:
        if not isinstance(job_id, str) or not job_id.strip():
            raise ProductionAdapterError("production adapter batch blocked job_id cannot be empty")
