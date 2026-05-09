from __future__ import annotations

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from shootflow.assembly import (
    RENDER_TASKS_MANIFEST_PATH,
    AssemblyPlan,
    AssemblyPlanError,
    load_trusted_render_tasks_manifest,
)
from shootflow.catalog import load_ingest_manifest, production_assets_from_manifest
from shootflow.production import ProductionPlan, build_production_plan
from shootflow.production_scheduler import (
    PRODUCTION_SCHEDULER_REPORT_PATH,
    DryRunProductionSchedulerError,
    load_dry_run_production_scheduler_report,
)
from shootflow.production_status import (
    PRODUCTION_STATUS_MANIFEST_PATH,
    ProductionStatusError,
    ProductionStatusManifest,
    load_production_status_manifest,
    production_plan_fingerprint,
)
from shootflow.render_scheduler import (
    RENDER_SCHEDULER_REPORT_PATH,
    DryRunRenderSchedulerError,
    load_dry_run_render_scheduler_report,
)
from shootflow.render_status import (
    RENDER_STATUS_MANIFEST_PATH,
    RenderStatusError,
    RenderStatusManifest,
    load_render_status_manifest,
    render_plan_fingerprint,
)


_WORKSPACE_HEALTH_SCHEMA_VERSION = 3
_SCHEDULER_RUNTIME_ARGS = ("--renderer", "--started-at", "--completed-at", "--generated-at")
_PRODUCTION_SCHEDULER_RUNTIME_ARGS = ("--worker", "--started-at", "--completed-at", "--generated-at")


class WorkspaceHealthError(ValueError):
    """Raised when a workspace health summary cannot be built."""


@dataclass(frozen=True)
class WorkspaceArtifactHealth:
    path: Path
    exists: bool
    valid: bool
    error_message: str | None = None


@dataclass(frozen=True)
class WorkspaceRenderStatusCounts:
    pending: int = 0
    running: int = 0
    succeeded: int = 0
    failed: int = 0
    retryable: int = 0


@dataclass(frozen=True)
class WorkspaceProductionStatusCounts:
    pending: int = 0
    running: int = 0
    succeeded: int = 0
    failed: int = 0
    retryable: int = 0


@dataclass(frozen=True)
class WorkspaceNextAction:
    name: str
    command: tuple[str, ...] = ()
    requires_runtime_args: tuple[str, ...] = ()
    writes_files: bool = False
    requires: tuple[str, ...] = ()


@dataclass(frozen=True)
class WorkspaceHealthSummary:
    workspace_root: Path
    production_plan_exists: bool
    production_status: WorkspaceArtifactHealth
    production_scheduler_report: WorkspaceArtifactHealth
    production_plan_fingerprint: str | None
    production_job_count: int
    production_status_counts: WorkspaceProductionStatusCounts
    render_tasks: WorkspaceArtifactHealth
    render_status: WorkspaceArtifactHealth
    scheduler_report: WorkspaceArtifactHealth
    shoot_slug: str | None
    render_plan_fingerprint: str | None
    render_inputs_fingerprint: str | None
    render_input_count: int
    production_scheduler_product_metrics: Mapping[str, int] | None
    render_scheduler_product_metrics: Mapping[str, int] | None
    task_count: int
    status_counts: WorkspaceRenderStatusCounts
    next_action: WorkspaceNextAction
    safety_notes: tuple[str, ...]


def build_workspace_health_summary(workspace_root: Path | str) -> WorkspaceHealthSummary:
    """Summarize trusted ShootFlow handoffs without creating or repairing files."""

    root = _workspace_root(workspace_root)
    ingest_manifest_path = root / "ingest_manifest.json"
    production_status_path = root / PRODUCTION_STATUS_MANIFEST_PATH
    production_scheduler_report_path = root / PRODUCTION_SCHEDULER_REPORT_PATH
    render_tasks_path = root / RENDER_TASKS_MANIFEST_PATH
    render_status_path = root / RENDER_STATUS_MANIFEST_PATH
    scheduler_report_path = root / RENDER_SCHEDULER_REPORT_PATH

    trusted_production_plan: ProductionPlan | None = None
    production_status_manifest: ProductionStatusManifest | None = None
    trusted_plan: AssemblyPlan | None = None
    render_status_manifest: RenderStatusManifest | None = None
    render_inputs_fingerprint: str | None = None
    render_input_count = 0
    production_scheduler_product_metrics: Mapping[str, int] | None = None
    render_scheduler_product_metrics: Mapping[str, int] | None = None

    if _path_exists_or_is_symlink(ingest_manifest_path):
        try:
            catalog = load_ingest_manifest(ingest_manifest_path)
            trusted_production_plan = build_production_plan(
                production_assets_from_manifest(catalog),
                shoot_slug=catalog.shoot_slug,
            )
        except Exception:
            trusted_production_plan = None

    if trusted_production_plan is not None and _path_exists_or_is_symlink(production_status_path):
        try:
            production_status_manifest = load_production_status_manifest(
                root,
                trusted_plan=trusted_production_plan,
            )
            production_status = WorkspaceArtifactHealth(
                path=production_status_path,
                exists=True,
                valid=True,
            )
        except (ProductionStatusError, OSError, FileNotFoundError) as exc:
            production_status = WorkspaceArtifactHealth(
                path=production_status_path,
                exists=True,
                valid=False,
                error_message=f"invalid production status manifest: {exc}",
            )
    else:
        production_status = WorkspaceArtifactHealth(
            path=production_status_path,
            exists=_path_exists_or_is_symlink(production_status_path),
            valid=False,
            error_message=(
                "production status manifest requires a valid ingest manifest"
                if trusted_production_plan is None and _path_exists_or_is_symlink(production_status_path)
                else None
            ),
        )

    if (
        trusted_production_plan is not None
        and production_status_manifest is not None
        and _path_exists_or_is_symlink(production_scheduler_report_path)
    ):
        try:
            production_scheduler_report_manifest = load_dry_run_production_scheduler_report(
                root,
                trusted_plan=trusted_production_plan,
                final_manifest=production_status_manifest,
            )
            production_scheduler_product_metrics = (
                production_scheduler_report_manifest.product_metrics
            )
            production_scheduler_report = WorkspaceArtifactHealth(
                path=production_scheduler_report_path,
                exists=True,
                valid=True,
            )
        except (DryRunProductionSchedulerError, OSError, FileNotFoundError) as exc:
            production_scheduler_report = WorkspaceArtifactHealth(
                path=production_scheduler_report_path,
                exists=True,
                valid=False,
                error_message=f"invalid production scheduler report: {exc}",
            )
    else:
        production_scheduler_report = WorkspaceArtifactHealth(
            path=production_scheduler_report_path,
            exists=_path_exists_or_is_symlink(production_scheduler_report_path),
            valid=False,
            error_message=(
                "production scheduler report requires valid production status"
                if (
                    trusted_production_plan is None
                    or production_status_manifest is None
                )
                and _path_exists_or_is_symlink(production_scheduler_report_path)
                else None
            ),
        )

    if _path_exists_or_is_symlink(render_tasks_path):
        try:
            loaded_plan = load_trusted_render_tasks_manifest(root)
            render_input_count, render_inputs_fingerprint = _render_input_provenance(
                root,
                trusted_plan=loaded_plan,
            )
            trusted_plan = loaded_plan
            render_tasks = WorkspaceArtifactHealth(
                path=render_tasks_path,
                exists=True,
                valid=True,
            )
        except (AssemblyPlanError, WorkspaceHealthError, OSError, FileNotFoundError) as exc:
            render_tasks = WorkspaceArtifactHealth(
                path=render_tasks_path,
                exists=True,
                valid=False,
                error_message=f"invalid render task manifest: {exc}",
            )
    else:
        render_tasks = WorkspaceArtifactHealth(
            path=render_tasks_path,
            exists=False,
            valid=False,
        )

    if trusted_plan is not None and _path_exists_or_is_symlink(render_status_path):
        try:
            render_status_manifest = load_render_status_manifest(root, trusted_plan=trusted_plan)
            render_status = WorkspaceArtifactHealth(
                path=render_status_path,
                exists=True,
                valid=True,
            )
        except (RenderStatusError, OSError, FileNotFoundError) as exc:
            render_status = WorkspaceArtifactHealth(
                path=render_status_path,
                exists=True,
                valid=False,
                error_message=f"invalid render status manifest: {exc}",
            )
    else:
        render_status = WorkspaceArtifactHealth(
            path=render_status_path,
            exists=_path_exists_or_is_symlink(render_status_path),
            valid=False,
            error_message=(
                "render status manifest requires a valid render task manifest"
                if trusted_plan is None and _path_exists_or_is_symlink(render_status_path)
                else None
            ),
        )

    if (
        trusted_plan is not None
        and render_status_manifest is not None
        and _path_exists_or_is_symlink(scheduler_report_path)
    ):
        try:
            render_scheduler_report_manifest = load_dry_run_render_scheduler_report(
                root,
                trusted_plan=trusted_plan,
                final_manifest=render_status_manifest,
            )
            render_scheduler_product_metrics = render_scheduler_report_manifest.product_metrics
            scheduler_report = WorkspaceArtifactHealth(
                path=scheduler_report_path,
                exists=True,
                valid=True,
            )
        except (DryRunRenderSchedulerError, OSError, FileNotFoundError) as exc:
            scheduler_report = WorkspaceArtifactHealth(
                path=scheduler_report_path,
                exists=True,
                valid=False,
                error_message=f"invalid render scheduler report: {exc}",
            )
    else:
        scheduler_report = WorkspaceArtifactHealth(
            path=scheduler_report_path,
            exists=_path_exists_or_is_symlink(scheduler_report_path),
            valid=False,
            error_message=(
                "scheduler report requires valid render tasks and render status"
                if (trusted_plan is None or render_status_manifest is None)
                and _path_exists_or_is_symlink(scheduler_report_path)
                else None
            ),
        )

    status_counts = _status_counts(render_status_manifest)
    production_status_counts = _production_status_counts(production_status_manifest)
    summary = WorkspaceHealthSummary(
        workspace_root=root,
        production_plan_exists=trusted_production_plan is not None,
        production_status=production_status,
        production_scheduler_report=production_scheduler_report,
        production_plan_fingerprint=(
            None
            if trusted_production_plan is None
            else production_plan_fingerprint(trusted_production_plan)
        ),
        production_job_count=(
            0 if trusted_production_plan is None else len(trusted_production_plan.jobs)
        ),
        production_status_counts=production_status_counts,
        render_tasks=render_tasks,
        render_status=render_status,
        scheduler_report=scheduler_report,
        shoot_slug=(
            trusted_plan.shoot_slug
            if trusted_plan is not None
            else (
                None
                if trusted_production_plan is None
                else trusted_production_plan.shoot_slug
            )
        ),
        render_plan_fingerprint=(
            None if trusted_plan is None else render_plan_fingerprint(trusted_plan)
        ),
        render_inputs_fingerprint=render_inputs_fingerprint,
        render_input_count=render_input_count,
        production_scheduler_product_metrics=production_scheduler_product_metrics,
        render_scheduler_product_metrics=render_scheduler_product_metrics,
        task_count=0 if trusted_plan is None else len(trusted_plan.render_tasks),
        status_counts=status_counts,
        next_action=_next_action(
            root,
            ingest_manifest_path=ingest_manifest_path,
            trusted_production_plan=trusted_production_plan,
            production_status=production_status,
            production_scheduler_report=production_scheduler_report,
            production_status_counts=production_status_counts,
            trusted_plan=trusted_plan,
            render_tasks=render_tasks,
            render_status=render_status,
            scheduler_report=scheduler_report,
            status_counts=status_counts,
        ),
        safety_notes=(
            "workspace-health is read-only and never creates, resets, deletes, or repairs manifests",
            "invalid handoffs are reported for review instead of being overwritten",
        ),
    )
    _validate_summary(summary)
    return summary


def workspace_health_summary_to_dict(summary: WorkspaceHealthSummary) -> dict[str, object]:
    if not isinstance(summary, WorkspaceHealthSummary):
        raise WorkspaceHealthError("summary must be a WorkspaceHealthSummary")
    return {
        "schema_version": _WORKSPACE_HEALTH_SCHEMA_VERSION,
        "workspace": str(summary.workspace_root),
        "shoot_slug": summary.shoot_slug,
        "production_plan_fingerprint": summary.production_plan_fingerprint,
        "production_job_count": summary.production_job_count,
        "render_plan_fingerprint": summary.render_plan_fingerprint,
        "render_inputs_fingerprint": summary.render_inputs_fingerprint,
        "render_input_count": summary.render_input_count,
        "production_scheduler_product_metrics": _optional_metrics_to_dict(
            summary.production_scheduler_product_metrics
        ),
        "render_scheduler_product_metrics": _optional_metrics_to_dict(
            summary.render_scheduler_product_metrics
        ),
        "task_count": summary.task_count,
        "artifacts": {
            "production_status": _artifact_to_dict(summary.production_status),
            "production_scheduler_report": _artifact_to_dict(
                summary.production_scheduler_report
            ),
            "render_tasks": _artifact_to_dict(summary.render_tasks),
            "render_status": _artifact_to_dict(summary.render_status),
            "scheduler_report": _artifact_to_dict(summary.scheduler_report),
        },
        "production_status_counts": {
            "pending": summary.production_status_counts.pending,
            "running": summary.production_status_counts.running,
            "succeeded": summary.production_status_counts.succeeded,
            "failed": summary.production_status_counts.failed,
            "retryable": summary.production_status_counts.retryable,
        },
        "status_counts": {
            "pending": summary.status_counts.pending,
            "running": summary.status_counts.running,
            "succeeded": summary.status_counts.succeeded,
            "failed": summary.status_counts.failed,
            "retryable": summary.status_counts.retryable,
        },
        "next_action": _next_action_to_dict(summary.next_action),
        "safety_notes": list(summary.safety_notes),
    }


def _workspace_root(workspace_root: Path | str) -> Path:
    if not isinstance(workspace_root, (Path, str)):
        raise WorkspaceHealthError("workspace_root must be a pathlib.Path or string")
    root = Path(workspace_root)
    if root.is_symlink():
        raise WorkspaceHealthError(f"Refusing workspace symlink: {root}")
    if not root.exists():
        raise WorkspaceHealthError(f"workspace_root does not exist: {root}")
    if root.exists() and not root.is_dir():
        raise WorkspaceHealthError(f"Workspace root must be a directory: {root}")
    return root.resolve()


def _path_exists_or_is_symlink(path: Path) -> bool:
    return path.exists() or path.is_symlink()


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    current = path
    while True:
        try:
            if current.is_symlink():
                raise WorkspaceHealthError(f"Refusing symlinked {label}: {current}")
        except OSError as exc:
            raise WorkspaceHealthError(f"Unable to inspect {label}: {current}") from exc
        if current == root or current.absolute() == root.absolute():
            break
        if current.parent == current:
            break
        current = current.parent


def _status_counts(manifest: RenderStatusManifest | None) -> WorkspaceRenderStatusCounts:
    if manifest is None:
        return WorkspaceRenderStatusCounts()
    return WorkspaceRenderStatusCounts(
        pending=sum(1 for status in manifest.task_statuses if status.state == "pending"),
        running=sum(1 for status in manifest.task_statuses if status.state == "running"),
        succeeded=sum(1 for status in manifest.task_statuses if status.state == "succeeded"),
        failed=sum(1 for status in manifest.task_statuses if status.state == "failed"),
        retryable=sum(1 for status in manifest.task_statuses if status.state == "retryable"),
    )


def _production_status_counts(
    manifest: ProductionStatusManifest | None,
) -> WorkspaceProductionStatusCounts:
    if manifest is None:
        return WorkspaceProductionStatusCounts()
    return WorkspaceProductionStatusCounts(
        pending=sum(1 for status in manifest.job_statuses if status.state == "pending"),
        running=sum(1 for status in manifest.job_statuses if status.state == "running"),
        succeeded=sum(1 for status in manifest.job_statuses if status.state == "succeeded"),
        failed=sum(1 for status in manifest.job_statuses if status.state == "failed"),
        retryable=sum(1 for status in manifest.job_statuses if status.state == "retryable"),
    )


def _render_input_provenance(
    root: Path,
    *,
    trusted_plan: AssemblyPlan,
) -> tuple[int, str]:
    digest = hashlib.sha256()
    input_paths = _unique_render_input_paths(trusted_plan)
    for input_path in input_paths:
        path = root / input_path
        _reject_symlink_path(path, root, "render input")
        if not path.exists():
            raise WorkspaceHealthError(f"Missing render input: {input_path}")
        if not path.is_file():
            raise WorkspaceHealthError(f"Render input must be a file: {input_path}")
        file_digest = _file_sha256(path)
        file_size = path.stat().st_size
        digest.update(input_path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(str(file_size).encode("ascii"))
        digest.update(b"\0")
        digest.update(file_digest.encode("ascii"))
        digest.update(b"\n")
    return len(input_paths), digest.hexdigest()


def _unique_render_input_paths(trusted_plan: AssemblyPlan) -> tuple[str, ...]:
    seen: set[str] = set()
    input_paths: list[str] = []
    for task in trusted_plan.render_tasks:
        for input_path in task.inputs:
            if input_path in seen:
                continue
            seen.add(input_path)
            input_paths.append(input_path)
    return tuple(sorted(input_paths))


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise WorkspaceHealthError(f"Unable to checksum render input: {path}") from exc
    return digest.hexdigest()


def _next_action(
    workspace_root: Path,
    *,
    ingest_manifest_path: Path,
    trusted_production_plan: ProductionPlan | None,
    production_status: WorkspaceArtifactHealth,
    production_scheduler_report: WorkspaceArtifactHealth,
    production_status_counts: WorkspaceProductionStatusCounts,
    trusted_plan: AssemblyPlan | None,
    render_tasks: WorkspaceArtifactHealth,
    render_status: WorkspaceArtifactHealth,
    scheduler_report: WorkspaceArtifactHealth,
    status_counts: WorkspaceRenderStatusCounts,
) -> WorkspaceNextAction:
    if production_status.exists and not production_status.valid:
        return WorkspaceNextAction(name="review_invalid_production_status")
    if production_scheduler_report.exists and not production_scheduler_report.valid:
        return WorkspaceNextAction(name="review_invalid_production_scheduler_report")
    if trusted_production_plan is not None:
        if not production_status.exists:
            return WorkspaceNextAction(
                name="init_production_status",
                command=(
                    "init-production-status",
                    "--ingest-manifest",
                    str(ingest_manifest_path),
                ),
                writes_files=True,
            )
        if production_scheduler_report.valid and (
            production_status_counts.succeeded != len(trusted_production_plan.jobs)
        ):
            return WorkspaceNextAction(name="review_production_scheduler_report")
        if production_status_counts.running:
            return WorkspaceNextAction(name="review_production_status")
        if production_status_counts.pending:
            return WorkspaceNextAction(
                name="run_dry_run_production_scheduler",
                command=(
                    "dry-run-production-scheduler",
                    "--ingest-manifest",
                    str(ingest_manifest_path),
                ),
                requires_runtime_args=_PRODUCTION_SCHEDULER_RUNTIME_ARGS,
                writes_files=True,
            )
        if production_status_counts.failed or production_status_counts.retryable:
            return WorkspaceNextAction(name="review_production_status")
    if render_tasks.exists and not render_tasks.valid:
        return WorkspaceNextAction(name="review_invalid_render_tasks")
    if trusted_plan is None:
        return WorkspaceNextAction(
            name="write_render_tasks",
            requires=(
                "trusted ingest_manifest.json",
                "analysis/instagram_storylines.json",
                "graded outputs for selected storyline assets",
            ),
            writes_files=True,
        )
    if render_status.exists and not render_status.valid:
        return WorkspaceNextAction(name="review_invalid_render_status")
    if not render_status.exists:
        return WorkspaceNextAction(
            name="init_render_status",
            command=("init-render-status", "--workspace", str(workspace_root)),
            writes_files=True,
        )
    if scheduler_report.exists and not scheduler_report.valid:
        return WorkspaceNextAction(name="review_invalid_scheduler_report")
    if scheduler_report.valid:
        if status_counts.succeeded == len(trusted_plan.render_tasks):
            return WorkspaceNextAction(name="review_deliverables")
        return WorkspaceNextAction(name="review_scheduler_report")
    return WorkspaceNextAction(
        name="run_dry_run_render_scheduler",
        command=_scheduler_command(workspace_root, trusted_plan),
        requires_runtime_args=_SCHEDULER_RUNTIME_ARGS,
        writes_files=True,
    )


def _scheduler_command(workspace_root: Path, trusted_plan: AssemblyPlan) -> tuple[str, ...]:
    command = ["dry-run-render-scheduler", "--workspace", str(workspace_root)]
    for dependency_id in _non_render_dependency_ids(trusted_plan):
        command.extend(["--completed-dependency", dependency_id])
    return tuple(command)


def _non_render_dependency_ids(trusted_plan: AssemblyPlan) -> tuple[str, ...]:
    render_task_ids = {task.task_id for task in trusted_plan.render_tasks}
    dependency_ids: list[str] = []
    seen: set[str] = set()
    for task in trusted_plan.render_tasks:
        for dependency_id in task.depends_on:
            if dependency_id in render_task_ids or dependency_id in seen:
                continue
            seen.add(dependency_id)
            dependency_ids.append(dependency_id)
    return tuple(dependency_ids)


def _artifact_to_dict(artifact: WorkspaceArtifactHealth) -> dict[str, object]:
    return {
        "path": str(artifact.path),
        "exists": artifact.exists,
        "valid": artifact.valid,
        "error_message": artifact.error_message,
    }


def _next_action_to_dict(action: WorkspaceNextAction) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": action.name,
        "writes_files": action.writes_files,
    }
    if action.command:
        payload["command"] = list(action.command)
    if action.requires_runtime_args:
        payload["requires_runtime_args"] = list(action.requires_runtime_args)
    if action.requires:
        payload["requires"] = list(action.requires)
    return payload


def _optional_metrics_to_dict(metrics: Mapping[str, int] | None) -> dict[str, int] | None:
    if metrics is None:
        return None
    return dict(metrics)


def _validate_summary(summary: WorkspaceHealthSummary) -> None:
    if not isinstance(summary, WorkspaceHealthSummary):
        raise WorkspaceHealthError("summary must be a WorkspaceHealthSummary")
    if not isinstance(summary.workspace_root, Path):
        raise WorkspaceHealthError("summary workspace_root must be a Path")
    if summary.production_job_count < 0:
        raise WorkspaceHealthError("summary production_job_count cannot be negative")
    if summary.task_count < 0:
        raise WorkspaceHealthError("summary task_count cannot be negative")
    if summary.production_plan_fingerprint is not None and (
        not isinstance(summary.production_plan_fingerprint, str)
        or len(summary.production_plan_fingerprint) != 64
    ):
        raise WorkspaceHealthError("summary production_plan_fingerprint is invalid")
    if summary.render_input_count < 0:
        raise WorkspaceHealthError("summary render_input_count cannot be negative")
    if summary.render_inputs_fingerprint is not None and (
        not isinstance(summary.render_inputs_fingerprint, str)
        or len(summary.render_inputs_fingerprint) != 64
    ):
        raise WorkspaceHealthError("summary render_inputs_fingerprint is invalid")
    _validate_optional_product_metrics(
        summary.production_scheduler_product_metrics,
        "production_scheduler_product_metrics",
    )
    _validate_optional_product_metrics(
        summary.render_scheduler_product_metrics,
        "render_scheduler_product_metrics",
    )


def _validate_optional_product_metrics(
    metrics: Mapping[str, int] | None,
    label: str,
) -> None:
    if metrics is None:
        return
    if not isinstance(metrics, Mapping):
        raise WorkspaceHealthError(f"summary {label} must be a mapping or None")
    for key, value in metrics.items():
        if not isinstance(key, str) or not key.strip():
            raise WorkspaceHealthError(f"summary {label} keys must be non-empty strings")
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise WorkspaceHealthError(f"summary {label} values must be non-negative integers")
