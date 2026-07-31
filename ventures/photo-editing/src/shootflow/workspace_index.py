from __future__ import annotations

import json
import os
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from shootflow.assembly import (
    RENDER_TASKS_MANIFEST_PATH,
    AssemblyPlan,
    load_trusted_render_tasks_manifest,
)
from shootflow.catalog import ShootCatalog, load_ingest_manifest, production_assets_from_manifest
from shootflow.production import ProductionPlan, build_production_plan
from shootflow.production_report import ProductionPlanReport, build_production_plan_report
from shootflow.production_scheduler import (
    PRODUCTION_SCHEDULER_REPORT_PATH,
    DryRunProductionSchedulerReport,
    load_dry_run_production_scheduler_report,
)
from shootflow.production_status import (
    PRODUCTION_STATUS_MANIFEST_PATH,
    ProductionStatusManifest,
    load_production_status_manifest,
)
from shootflow.render_scheduler import (
    RENDER_SCHEDULER_REPORT_PATH,
    DryRunRenderSchedulerReport,
    load_dry_run_render_scheduler_report,
)
from shootflow.render_status import (
    RENDER_STATUS_MANIFEST_PATH,
    RenderStatusManifest,
    load_render_status_manifest,
    render_plan_fingerprint,
)
from shootflow.story import STORYLINE_ARTIFACT_PATH
from shootflow.workflow_authority import (
    WorkflowAuthorityError,
    observe_only_workflow_authority_to_dict,
    validate_observe_only_workflow_authority,
)
from shootflow.workspace_health import build_workspace_health_summary, workspace_health_summary_to_dict

WORKSPACE_INDEX_PATH = "shootflow_workspace_index.json"
_WORKSPACE_INDEX_SCHEMA_VERSION = 2
_WORKSPACE_INDEX_LEGACY_SCHEMA_VERSION = 1
_INDEX_KEYS = frozenset(
    {
        "schema_version",
        "workflow_authority",
        "generated_at",
        "workspace_root",
        "index_path",
        "shoot_slug",
        "artifacts",
        "notes",
    }
)
_LEGACY_INDEX_KEYS = _INDEX_KEYS - {"workflow_authority"}
_ARTIFACT_KEYS = frozenset({"name", "path", "present", "trusted", "status", "summary"})


class WorkspaceIndexError(ValueError):
    """Raised when a workspace index cannot be built or loaded safely."""


@dataclass(frozen=True)
class WorkspaceArtifactSummary:
    name: str
    path: str
    present: bool
    trusted: bool
    status: str
    summary: dict[str, object]


@dataclass(frozen=True)
class WorkspaceIndex:
    schema_version: int
    workflow_authority: Mapping[str, object]
    generated_at: str
    workspace_root: Path
    index_path: Path
    shoot_slug: str | None
    artifacts: tuple[WorkspaceArtifactSummary, ...]
    notes: tuple[str, ...]


def build_workspace_index(
    workspace_root: Path | str,
    *,
    generated_at: str,
) -> WorkspaceIndex:
    """Build a metadata-only summary of known ShootFlow workspace artifacts.

    The index is intentionally observational: it can validate already-trusted
    manifests and reports, but it never creates analysis, graded media, render
    tasks, statuses, deliverables, or deletion authority.
    """

    root = _workspace_root(workspace_root)
    _validate_timestamp(generated_at)

    ingest_artifact, catalog = _ingest_manifest_artifact(root)
    production_artifact, trusted_production_plan = _production_plan_artifact(
        root,
        catalog=catalog,
    )
    production_status_artifact, production_status = _production_status_artifact(
        root,
        trusted_plan=trusted_production_plan,
    )
    production_scheduler_report_artifact = _production_scheduler_report_artifact(
        root,
        trusted_plan=trusted_production_plan,
        final_status=production_status,
    )
    storyline_artifact = _storyline_artifact(root)
    render_tasks_artifact, trusted_plan = _render_tasks_artifact(root)
    render_status_artifact, final_status = _render_status_artifact(
        root,
        trusted_plan=trusted_plan,
    )
    scheduler_report_artifact = _scheduler_report_artifact(
        root,
        trusted_plan=trusted_plan,
        final_status=final_status,
    )
    workspace_health_artifact = _workspace_health_artifact(root)

    index = WorkspaceIndex(
        schema_version=_WORKSPACE_INDEX_SCHEMA_VERSION,
        workflow_authority=observe_only_workflow_authority_to_dict(),
        generated_at=generated_at,
        workspace_root=root,
        index_path=root / WORKSPACE_INDEX_PATH,
        shoot_slug=_shoot_slug(
            catalog=catalog,
            trusted_production_plan=trusted_production_plan,
            production_status=production_status,
            trusted_plan=trusted_plan,
            final_status=final_status,
        ),
        artifacts=(
            ingest_artifact,
            production_artifact,
            production_status_artifact,
            production_scheduler_report_artifact,
            storyline_artifact,
            render_tasks_artifact,
            render_status_artifact,
            scheduler_report_artifact,
            workspace_health_artifact,
        ),
        notes=(
            "metadata only",
            "no source, analysis, graded, render, deliverable, or deletion files were created",
            "model-authored storyline artifacts remain untrusted until rebound to a production plan",
        ),
    )
    _validate_workspace_index(index)
    return index


def write_workspace_index(index: WorkspaceIndex, workspace_root: Path | str) -> Path:
    """Persist a workspace index through a no-follow temporary metadata file."""

    if not isinstance(index, WorkspaceIndex):
        raise WorkspaceIndexError("index must be a WorkspaceIndex")
    _validate_workspace_index(index)
    root = _workspace_root(workspace_root)
    _validate_index_binding(index, root)
    index_path = root / WORKSPACE_INDEX_PATH
    _reject_symlink_path(index_path, root, "workspace index")
    legacy_temp_path = index_path.with_suffix(".json.tmp")
    _reject_symlink_path(legacy_temp_path, root, "temporary workspace index")
    if legacy_temp_path.exists():
        raise WorkspaceIndexError(f"Refusing stale temporary workspace index: {legacy_temp_path}")

    temp_path = index_path.with_name(f".{index_path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    _write_text_no_follow(temp_path, _workspace_index_json(index))
    try:
        _reject_symlink_path(temp_path, root, "temporary workspace index")
        temp_path.replace(index_path)
    except OSError as exc:
        raise WorkspaceIndexError(f"Unable to write workspace index: {index_path}") from exc
    finally:
        try:
            temp_path.unlink()
        except FileNotFoundError:
            pass
    return index_path


def load_workspace_index(workspace_root: Path | str) -> WorkspaceIndex:
    """Load a persisted workspace index without granting it authority."""

    root = _workspace_root(workspace_root)
    index_path = root / WORKSPACE_INDEX_PATH
    _reject_symlink_path(index_path, root, "workspace index")
    index = _workspace_index_from_json(_read_json_object(index_path))
    _validate_workspace_index(index)
    _validate_index_binding(index, root)
    return index


def workspace_index_to_dict(index: WorkspaceIndex) -> dict[str, object]:
    if not isinstance(index, WorkspaceIndex):
        raise WorkspaceIndexError("index must be a WorkspaceIndex")
    _validate_workspace_index(index)
    return {
        "schema_version": index.schema_version,
        "workflow_authority": dict(index.workflow_authority),
        "generated_at": index.generated_at,
        "workspace_root": str(index.workspace_root),
        "index_path": str(index.index_path),
        "shoot_slug": index.shoot_slug,
        "artifacts": [_artifact_to_dict(artifact) for artifact in index.artifacts],
        "notes": list(index.notes),
    }


def _ingest_manifest_artifact(root: Path) -> tuple[WorkspaceArtifactSummary, ShootCatalog | None]:
    path = root / "ingest_manifest.json"
    if not path.exists() and not path.is_symlink():
        return _missing_artifact("ingest_manifest", "ingest_manifest.json"), None
    try:
        catalog = load_ingest_manifest(path)
    except Exception as exc:
        return (
            _artifact(
                "ingest_manifest",
                "ingest_manifest.json",
                present=True,
                trusted=False,
                status="invalid",
                summary={"error": str(exc)},
            ),
            None,
        )
    return (
        _artifact(
            "ingest_manifest",
            "ingest_manifest.json",
            present=True,
            trusted=True,
            status="trusted",
            summary={
                "shoot_date": catalog.shoot_date,
                "shoot_slug": catalog.shoot_slug,
                "asset_count": len(catalog.assets),
                "photo_asset_count": sum(1 for asset in catalog.assets if asset.media_type == "photo"),
                "video_asset_count": sum(1 for asset in catalog.assets if asset.media_type == "video"),
            },
        ),
        catalog,
    )


def _production_plan_artifact(
    root: Path,
    *,
    catalog: ShootCatalog | None,
) -> tuple[WorkspaceArtifactSummary, ProductionPlan | None]:
    path = root / "ingest_manifest.json"
    if catalog is None:
        return _missing_artifact("production_plan", "derived_from_ingest_manifest"), None
    try:
        report = build_production_plan_report(path)
        plan = build_production_plan(
            production_assets_from_manifest(catalog),
            shoot_slug=catalog.shoot_slug,
        )
    except Exception as exc:
        return (
            _artifact(
                "production_plan",
                "derived_from_ingest_manifest",
                present=False,
                trusted=False,
                status="invalid",
                summary={"error": str(exc)},
            ),
            None,
        )
    return (
        _artifact(
            "production_plan",
            "derived_from_ingest_manifest",
            present=False,
            trusted=True,
            status="derived",
            summary=_production_report_summary(report),
        ),
        plan,
    )


def _production_status_artifact(
    root: Path,
    *,
    trusted_plan: ProductionPlan | None,
) -> tuple[WorkspaceArtifactSummary, ProductionStatusManifest | None]:
    path = root / PRODUCTION_STATUS_MANIFEST_PATH
    if not path.exists() and not path.is_symlink():
        return _missing_artifact("production_status", PRODUCTION_STATUS_MANIFEST_PATH), None
    if trusted_plan is None:
        return (
            _artifact(
                "production_status",
                PRODUCTION_STATUS_MANIFEST_PATH,
                present=True,
                trusted=False,
                status="present_untrusted",
                summary={"error": "production status requires trusted ingest manifest"},
            ),
            None,
        )
    try:
        manifest = load_production_status_manifest(root, trusted_plan=trusted_plan)
    except Exception as exc:
        return (
            _artifact(
                "production_status",
                PRODUCTION_STATUS_MANIFEST_PATH,
                present=True,
                trusted=False,
                status="invalid",
                summary={"error": str(exc)},
            ),
            None,
        )
    return (
        _artifact(
            "production_status",
            PRODUCTION_STATUS_MANIFEST_PATH,
            present=True,
            trusted=True,
            status="trusted",
            summary=_production_status_summary(manifest),
        ),
        manifest,
    )


def _production_scheduler_report_artifact(
    root: Path,
    *,
    trusted_plan: ProductionPlan | None,
    final_status: ProductionStatusManifest | None,
) -> WorkspaceArtifactSummary:
    path = root / PRODUCTION_SCHEDULER_REPORT_PATH
    if not path.exists() and not path.is_symlink():
        return _missing_artifact(
            "production_scheduler_report",
            PRODUCTION_SCHEDULER_REPORT_PATH,
        )
    if trusted_plan is None or final_status is None:
        return _artifact(
            "production_scheduler_report",
            PRODUCTION_SCHEDULER_REPORT_PATH,
            present=True,
            trusted=False,
            status="present_untrusted",
            summary={"error": "production scheduler report requires trusted production status"},
        )
    try:
        report = load_dry_run_production_scheduler_report(
            root,
            trusted_plan=trusted_plan,
            final_manifest=final_status,
        )
    except Exception as exc:
        return _artifact(
            "production_scheduler_report",
            PRODUCTION_SCHEDULER_REPORT_PATH,
            present=True,
            trusted=False,
            status="invalid",
            summary={"error": str(exc)},
        )
    return _artifact(
        "production_scheduler_report",
        PRODUCTION_SCHEDULER_REPORT_PATH,
        present=True,
        trusted=True,
        status="trusted",
        summary=_production_scheduler_report_summary(report),
    )


def _storyline_artifact(root: Path) -> WorkspaceArtifactSummary:
    path = root / STORYLINE_ARTIFACT_PATH
    if not path.exists() and not path.is_symlink():
        return _missing_artifact("storyline_artifact", STORYLINE_ARTIFACT_PATH)
    if path.is_symlink():
        return _artifact(
            "storyline_artifact",
            STORYLINE_ARTIFACT_PATH,
            present=True,
            trusted=False,
            status="invalid",
            summary={"error": f"Refusing storyline artifact symlink: {path}"},
        )
    if not path.is_file():
        return _artifact(
            "storyline_artifact",
            STORYLINE_ARTIFACT_PATH,
            present=True,
            trusted=False,
            status="invalid",
            summary={"error": f"Storyline artifact must be a file: {path}"},
        )
    return _artifact(
        "storyline_artifact",
        STORYLINE_ARTIFACT_PATH,
        present=True,
        trusted=False,
        status="present_unvalidated",
        summary={
            "trust_boundary": "load with a manifest-backed production plan before use",
        },
    )


def _workspace_health_artifact(root: Path) -> WorkspaceArtifactSummary:
    try:
        health = workspace_health_summary_to_dict(build_workspace_health_summary(root))
    except Exception as exc:
        return _artifact(
            "workspace_health",
            "derived_from_trusted_handoffs",
            present=False,
            trusted=False,
            status="invalid",
            summary={"error": str(exc)},
        )
    return _artifact(
        "workspace_health",
        "derived_from_trusted_handoffs",
        present=False,
        trusted=True,
        status="derived",
        summary={
            "production_plan_fingerprint": health["production_plan_fingerprint"],
            "production_job_count": health["production_job_count"],
            "production_status_counts": health["production_status_counts"],
            "production_scheduler_product_metrics": health[
                "production_scheduler_product_metrics"
            ],
            "render_plan_fingerprint": health["render_plan_fingerprint"],
            "render_inputs_fingerprint": health["render_inputs_fingerprint"],
            "render_input_count": health["render_input_count"],
            "render_scheduler_product_metrics": health[
                "render_scheduler_product_metrics"
            ],
            "task_count": health["task_count"],
            "workflow_authority": health["workflow_authority"],
            "status_counts": health["status_counts"],
            "next_action": health["next_action"],
        },
    )


def _render_tasks_artifact(root: Path) -> tuple[WorkspaceArtifactSummary, AssemblyPlan | None]:
    path = root / RENDER_TASKS_MANIFEST_PATH
    if not path.exists() and not path.is_symlink():
        return _missing_artifact("render_tasks", RENDER_TASKS_MANIFEST_PATH), None
    try:
        plan = load_trusted_render_tasks_manifest(root)
    except Exception as exc:
        return (
            _artifact(
                "render_tasks",
                RENDER_TASKS_MANIFEST_PATH,
                present=True,
                trusted=False,
                status="invalid",
                summary={"error": str(exc)},
            ),
            None,
        )
    return (
        _artifact(
            "render_tasks",
            RENDER_TASKS_MANIFEST_PATH,
            present=True,
            trusted=True,
            status="trusted",
            summary={
                "shoot_slug": plan.shoot_slug,
                "task_count": len(plan.render_tasks),
                "render_plan_fingerprint": render_plan_fingerprint(plan),
                "parallel_task_count": sum(1 for task in plan.render_tasks if task.can_run_in_parallel),
                "serial_task_count": sum(1 for task in plan.render_tasks if not task.can_run_in_parallel),
            },
        ),
        plan,
    )


def _render_status_artifact(
    root: Path,
    *,
    trusted_plan: AssemblyPlan | None,
) -> tuple[WorkspaceArtifactSummary, RenderStatusManifest | None]:
    path = root / RENDER_STATUS_MANIFEST_PATH
    if not path.exists() and not path.is_symlink():
        return _missing_artifact("render_status", RENDER_STATUS_MANIFEST_PATH), None
    if trusted_plan is None:
        return (
            _artifact(
                "render_status",
                RENDER_STATUS_MANIFEST_PATH,
                present=True,
                trusted=False,
                status="present_untrusted",
                summary={"error": "render status requires trusted render tasks"},
            ),
            None,
        )
    try:
        manifest = load_render_status_manifest(root, trusted_plan=trusted_plan)
    except Exception as exc:
        return (
            _artifact(
                "render_status",
                RENDER_STATUS_MANIFEST_PATH,
                present=True,
                trusted=False,
                status="invalid",
                summary={"error": str(exc)},
            ),
            None,
        )
    return (
        _artifact(
            "render_status",
            RENDER_STATUS_MANIFEST_PATH,
            present=True,
            trusted=True,
            status="trusted",
            summary=_render_status_summary(manifest),
        ),
        manifest,
    )


def _scheduler_report_artifact(
    root: Path,
    *,
    trusted_plan: AssemblyPlan | None,
    final_status: RenderStatusManifest | None,
) -> WorkspaceArtifactSummary:
    path = root / RENDER_SCHEDULER_REPORT_PATH
    if not path.exists() and not path.is_symlink():
        return _missing_artifact("render_scheduler_report", RENDER_SCHEDULER_REPORT_PATH)
    if trusted_plan is None or final_status is None:
        return _artifact(
            "render_scheduler_report",
            RENDER_SCHEDULER_REPORT_PATH,
            present=True,
            trusted=False,
            status="present_untrusted",
            summary={"error": "scheduler report requires trusted render tasks and final status"},
        )
    try:
        report = load_dry_run_render_scheduler_report(
            root,
            trusted_plan=trusted_plan,
            final_manifest=final_status,
        )
    except Exception as exc:
        return _artifact(
            "render_scheduler_report",
            RENDER_SCHEDULER_REPORT_PATH,
            present=True,
            trusted=False,
            status="invalid",
            summary={"error": str(exc)},
        )
    return _artifact(
        "render_scheduler_report",
        RENDER_SCHEDULER_REPORT_PATH,
        present=True,
        trusted=True,
        status="trusted",
        summary=_scheduler_report_summary(report),
    )


def _production_report_summary(report: ProductionPlanReport) -> dict[str, object]:
    return {
        "shoot_slug": report.shoot_slug,
        "copied_manifest_item_count": report.copied_manifest_item_count,
        "photo_asset_count": report.photo_asset_count,
        "video_asset_count": report.video_asset_count,
        "production_job_count": report.production_job_count,
        "parallel_job_count": report.parallel_job_count,
        "serial_job_count": report.serial_job_count,
        "wave_count": len(report.waves),
        "deliverable_count": len(report.deliverables),
    }


def _production_status_summary(manifest: ProductionStatusManifest) -> dict[str, object]:
    return {
        "shoot_slug": manifest.shoot_slug,
        "production_plan_fingerprint": manifest.production_plan_fingerprint,
        "job_count": len(manifest.job_statuses),
        "pending_job_count": _production_status_count(manifest, "pending"),
        "running_job_count": _production_status_count(manifest, "running"),
        "succeeded_job_count": _production_status_count(manifest, "succeeded"),
        "failed_job_count": _production_status_count(manifest, "failed"),
        "retryable_job_count": _production_status_count(manifest, "retryable"),
    }


def _production_scheduler_report_summary(
    report: DryRunProductionSchedulerReport,
) -> dict[str, object]:
    return {
        "shoot_slug": report.shoot_slug,
        "production_plan_fingerprint": report.production_plan_fingerprint,
        "production_status_fingerprint": report.production_status_fingerprint,
        "worker_adapter": report.worker_adapter,
        "stopped_reason": report.stopped_reason,
        "iteration_count": report.iteration_count,
        "total_job_count": report.total_job_count,
        "completed_job_count": len(report.completed_job_ids),
        "retryable_job_count": len(report.retryable_job_ids),
        "failed_job_count": len(report.failed_job_ids),
        "blocked_job_count": len(report.blocked_job_ids),
        "review_required_job_count": len(report.review_required_job_ids),
        "outputs_materialized_count": len(report.outputs_materialized),
        "product_metrics": dict(report.product_metrics),
    }


def _render_status_summary(manifest: RenderStatusManifest) -> dict[str, object]:
    return {
        "shoot_slug": manifest.shoot_slug,
        "render_plan_fingerprint": manifest.render_plan_fingerprint,
        "task_count": len(manifest.task_statuses),
        "pending_task_count": _status_count(manifest, "pending"),
        "running_task_count": _status_count(manifest, "running"),
        "succeeded_task_count": _status_count(manifest, "succeeded"),
        "failed_task_count": _status_count(manifest, "failed"),
        "retryable_task_count": _status_count(manifest, "retryable"),
    }


def _scheduler_report_summary(report: DryRunRenderSchedulerReport) -> dict[str, object]:
    return {
        "shoot_slug": report.shoot_slug,
        "render_plan_fingerprint": report.render_plan_fingerprint,
        "renderer_adapter": report.renderer_adapter,
        "stopped_reason": report.stopped_reason,
        "iteration_count": report.iteration_count,
        "total_task_count": report.total_task_count,
        "completed_task_count": len(report.completed_task_ids),
        "retryable_task_count": len(report.retryable_task_ids),
        "failed_task_count": len(report.failed_task_ids),
        "blocked_task_count": len(report.blocked_task_ids),
        "review_required_task_count": len(report.review_required_task_ids),
        "outputs_materialized_count": len(report.outputs_materialized),
        "product_metrics": dict(report.product_metrics),
    }


def _status_count(manifest: RenderStatusManifest, state: str) -> int:
    return sum(1 for status in manifest.task_statuses if status.state == state)


def _production_status_count(manifest: ProductionStatusManifest, state: str) -> int:
    return sum(1 for status in manifest.job_statuses if status.state == state)


def _shoot_slug(
    *,
    catalog: ShootCatalog | None,
    trusted_production_plan: ProductionPlan | None,
    production_status: ProductionStatusManifest | None,
    trusted_plan: AssemblyPlan | None,
    final_status: RenderStatusManifest | None,
) -> str | None:
    slugs = [
        slug
        for slug in (
            None if catalog is None else catalog.shoot_slug,
            None if trusted_production_plan is None else trusted_production_plan.shoot_slug,
            None if production_status is None else production_status.shoot_slug,
            None if trusted_plan is None else trusted_plan.shoot_slug,
            None if final_status is None else final_status.shoot_slug,
        )
        if slug is not None
    ]
    if not slugs:
        return None
    first_slug = slugs[0]
    if any(slug != first_slug for slug in slugs):
        return None
    return first_slug


def _artifact(
    name: str,
    path: str,
    *,
    present: bool,
    trusted: bool,
    status: str,
    summary: dict[str, object],
) -> WorkspaceArtifactSummary:
    artifact = WorkspaceArtifactSummary(
        name=name,
        path=path,
        present=present,
        trusted=trusted,
        status=status,
        summary=summary,
    )
    _validate_artifact(artifact)
    return artifact


def _missing_artifact(name: str, path: str) -> WorkspaceArtifactSummary:
    return _artifact(
        name,
        path,
        present=False,
        trusted=False,
        status="missing",
        summary={},
    )


def _workspace_index_json(index: WorkspaceIndex) -> str:
    return json.dumps(
        workspace_index_to_dict(index),
        ensure_ascii=True,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _workspace_index_from_json(raw_index: dict[str, object]) -> WorkspaceIndex:
    raw_schema_version = raw_index.get("schema_version")
    if raw_schema_version == _WORKSPACE_INDEX_SCHEMA_VERSION:
        _validate_exact_keys(raw_index, allowed_keys=_INDEX_KEYS, label="workspace index")
        workflow_authority = _validated_workflow_authority(
            raw_index["workflow_authority"],
            field_label="workflow_authority",
        )
    elif raw_schema_version == _WORKSPACE_INDEX_LEGACY_SCHEMA_VERSION:
        _validate_exact_keys(raw_index, allowed_keys=_LEGACY_INDEX_KEYS, label="workspace index")
        workflow_authority = observe_only_workflow_authority_to_dict()
    else:
        raise WorkspaceIndexError("Workspace index schema_version is unsupported")
    raw_artifacts = raw_index["artifacts"]
    if not isinstance(raw_artifacts, list):
        raise WorkspaceIndexError("workspace index artifacts must be a list")
    artifacts = tuple(_artifact_from_json(raw_artifact) for raw_artifact in raw_artifacts)
    artifacts = _normalize_workspace_health_authority(
        artifacts,
        workflow_authority=workflow_authority,
        legacy_schema=raw_schema_version == _WORKSPACE_INDEX_LEGACY_SCHEMA_VERSION,
    )
    raw_notes = raw_index["notes"]
    if not isinstance(raw_notes, list):
        raise WorkspaceIndexError("workspace index notes must be a list")
    return WorkspaceIndex(
        schema_version=_WORKSPACE_INDEX_SCHEMA_VERSION,
        workflow_authority=workflow_authority,
        generated_at=_json_string(raw_index["generated_at"], "generated_at"),
        workspace_root=Path(_json_string(raw_index["workspace_root"], "workspace_root")),
        index_path=Path(_json_string(raw_index["index_path"], "index_path")),
        shoot_slug=_json_optional_string(raw_index["shoot_slug"], "shoot_slug"),
        artifacts=artifacts,
        notes=tuple(_json_string(note, "notes") for note in raw_notes),
    )


def _artifact_from_json(raw_artifact: object) -> WorkspaceArtifactSummary:
    if not isinstance(raw_artifact, dict):
        raise WorkspaceIndexError("workspace index artifacts must contain objects")
    raw_artifact_dict = cast(dict[str, object], raw_artifact)
    _validate_exact_keys(
        raw_artifact_dict,
        allowed_keys=_ARTIFACT_KEYS,
        label="workspace index artifact",
    )
    summary = raw_artifact_dict["summary"]
    if not isinstance(summary, dict):
        raise WorkspaceIndexError("workspace index artifact summary must be an object")
    return _artifact(
        _json_string(raw_artifact_dict["name"], "artifact.name"),
        _json_string(raw_artifact_dict["path"], "artifact.path"),
        present=_json_bool(raw_artifact_dict["present"], "artifact.present"),
        trusted=_json_bool(raw_artifact_dict["trusted"], "artifact.trusted"),
        status=_json_string(raw_artifact_dict["status"], "artifact.status"),
        summary=dict(summary),
    )


def _artifact_to_dict(artifact: WorkspaceArtifactSummary) -> dict[str, object]:
    _validate_artifact(artifact)
    return {
        "name": artifact.name,
        "path": artifact.path,
        "present": artifact.present,
        "trusted": artifact.trusted,
        "status": artifact.status,
        "summary": artifact.summary,
    }


def _validate_workspace_index(index: WorkspaceIndex) -> None:
    if not isinstance(index, WorkspaceIndex):
        raise WorkspaceIndexError("index must be a WorkspaceIndex")
    if index.schema_version != _WORKSPACE_INDEX_SCHEMA_VERSION:
        raise WorkspaceIndexError("workspace index schema_version is unsupported")
    _validated_workflow_authority(index.workflow_authority, field_label="workflow_authority")
    _validate_timestamp(index.generated_at)
    if not isinstance(index.workspace_root, Path):
        raise WorkspaceIndexError("workspace_root must be a Path")
    if not isinstance(index.index_path, Path):
        raise WorkspaceIndexError("index_path must be a Path")
    if index.shoot_slug is not None and not isinstance(index.shoot_slug, str):
        raise WorkspaceIndexError("shoot_slug must be a string or None")
    if not isinstance(index.artifacts, tuple):
        raise WorkspaceIndexError("artifacts must be a tuple")
    for artifact in index.artifacts:
        _validate_artifact(artifact)
    if not isinstance(index.notes, tuple):
        raise WorkspaceIndexError("notes must be a tuple")
    for note in index.notes:
        if not isinstance(note, str) or not note.strip():
            raise WorkspaceIndexError("notes must contain non-empty strings")


def _validated_workflow_authority(value: object, *, field_label: str) -> dict[str, object]:
    try:
        validate_observe_only_workflow_authority(value, field_label=field_label)
    except WorkflowAuthorityError as exc:
        raise WorkspaceIndexError(str(exc)) from exc
    return dict(cast(Mapping[str, object], value))


def _normalize_workspace_health_authority(
    artifacts: tuple[WorkspaceArtifactSummary, ...],
    *,
    workflow_authority: Mapping[str, object],
    legacy_schema: bool,
) -> tuple[WorkspaceArtifactSummary, ...]:
    normalized: list[WorkspaceArtifactSummary] = []
    for artifact in artifacts:
        if artifact.name != "workspace_health":
            normalized.append(artifact)
            continue
        summary = dict(artifact.summary)
        if "workflow_authority" not in summary:
            if not legacy_schema:
                raise WorkspaceIndexError(
                    "workspace_health summary is missing workflow_authority"
                )
            summary["workflow_authority"] = dict(workflow_authority)
        else:
            summary["workflow_authority"] = _validated_workflow_authority(
                summary["workflow_authority"],
                field_label="workspace_health.workflow_authority",
            )
        normalized.append(
            _artifact(
                artifact.name,
                artifact.path,
                present=artifact.present,
                trusted=artifact.trusted,
                status=artifact.status,
                summary=summary,
            )
        )
    return tuple(normalized)


def _validate_index_binding(index: WorkspaceIndex, root: Path) -> None:
    expected_index_path = root / WORKSPACE_INDEX_PATH
    index_root = index.workspace_root if index.workspace_root.is_absolute() else (root / index.workspace_root)
    index_path = index.index_path if index.index_path.is_absolute() else (root / index.index_path)
    if index_root.resolve() != root.resolve():
        raise WorkspaceIndexError("workspace index workspace_root does not match requested workspace")
    if index_path.resolve(strict=False) != expected_index_path.resolve(strict=False):
        raise WorkspaceIndexError("workspace index index_path does not match requested workspace")


def _validate_artifact(artifact: WorkspaceArtifactSummary) -> None:
    if not isinstance(artifact, WorkspaceArtifactSummary):
        raise WorkspaceIndexError("artifact must be a WorkspaceArtifactSummary")
    for field_name in ("name", "path", "status"):
        value = getattr(artifact, field_name)
        if not isinstance(value, str) or not value.strip():
            raise WorkspaceIndexError(f"artifact {field_name} must be a non-empty string")
    if not isinstance(artifact.present, bool):
        raise WorkspaceIndexError("artifact present must be a boolean")
    if not isinstance(artifact.trusted, bool):
        raise WorkspaceIndexError("artifact trusted must be a boolean")
    if not isinstance(artifact.summary, dict):
        raise WorkspaceIndexError("artifact summary must be a dictionary")


def _is_system_symlink(path: Path) -> bool:
    if path.parent == Path("/") and path.name in {"var", "tmp", "etc"}:
        try:
            return path.resolve() == Path("/private") / path.name
        except OSError:
            return False
    return False


def _workspace_root(workspace_root: Path | str) -> Path:
    if not isinstance(workspace_root, (Path, str)):
        raise WorkspaceIndexError("workspace_root must be a pathlib.Path or string")
    root = Path(workspace_root).resolve()
    if root.is_symlink() and not _is_system_symlink(root):
        raise WorkspaceIndexError(f"Refusing workspace symlink: {root}")
    if not root.exists():
        raise WorkspaceIndexError(f"workspace_root does not exist: {root}")
    if root.exists() and not root.is_dir():
        raise WorkspaceIndexError(f"workspace_root must be a directory: {root}")
    return root.resolve()


def _validate_timestamp(timestamp: str) -> None:
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise WorkspaceIndexError("generated_at must be a non-empty string")
    if len(timestamp) > 80 or "\x00" in timestamp or "\n" in timestamp or "\r" in timestamp:
        raise WorkspaceIndexError("generated_at is invalid")


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    try:
        if path.is_symlink() and not _is_system_symlink(path):
            raise WorkspaceIndexError(f"Refusing symlinked {label}: {path}")
    except OSError as exc:
        raise WorkspaceIndexError(f"Unable to inspect {label}: {path}") from exc

    current = path.parent
    while current != root and current != current.parent:
        try:
            if current.exists() and current.is_symlink() and not _is_system_symlink(current):
                raise WorkspaceIndexError(f"Refusing symlinked parent for {label}: {current}")
        except OSError as exc:
            raise WorkspaceIndexError(f"Unable to inspect parent for {label}: {current}") from exc
        current = current.parent


def _write_text_no_follow(path: Path, content: str) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags, 0o600)
    except OSError as exc:
        raise WorkspaceIndexError(f"Unable to create temporary workspace index: {path}") from exc
    with os.fdopen(fd, "w", encoding="utf-8") as temp_file:
        temp_file.write(content)


def _read_json_object(path: Path) -> dict[str, object]:
    try:
        raw_text = _read_text_no_follow(path)
    except OSError as exc:
        raise WorkspaceIndexError(f"Unable to read workspace index: {path}") from exc
    try:
        raw_json = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise WorkspaceIndexError(f"Invalid workspace index JSON: {path}") from exc
    if not isinstance(raw_json, dict):
        raise WorkspaceIndexError("Workspace index must be a JSON object")
    return raw_json


def _read_text_no_follow(path: Path) -> str:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    try:
        with os.fdopen(fd, "r", encoding="utf-8") as index_file:
            return index_file.read()
    except Exception:
        os.close(fd)
        raise


def _validate_exact_keys(
    data: Mapping[str, object],
    *,
    allowed_keys: frozenset[str],
    label: str,
) -> None:
    unknown_keys = set(data) - allowed_keys
    missing_keys = allowed_keys - set(data)
    if unknown_keys:
        raise WorkspaceIndexError(f"{label} contains unknown fields: {sorted(unknown_keys)}")
    if missing_keys:
        raise WorkspaceIndexError(f"{label} is missing fields: {sorted(missing_keys)}")


def _json_string(value: object, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise WorkspaceIndexError(f"{field_name} must be a non-empty string")
    return value


def _json_optional_string(value: object, field_name: str) -> str | None:
    if value is None:
        return None
    return _json_string(value, field_name)


def _json_bool(value: object, field_name: str) -> bool:
    if not isinstance(value, bool):
        raise WorkspaceIndexError(f"{field_name} must be a boolean")
    return value
