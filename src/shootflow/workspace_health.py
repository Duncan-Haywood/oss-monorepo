from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from shootflow.assembly import (
    RENDER_TASKS_MANIFEST_PATH,
    AssemblyPlan,
    AssemblyPlanError,
    load_trusted_render_tasks_manifest,
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


_WORKSPACE_HEALTH_SCHEMA_VERSION = 1
_SCHEDULER_RUNTIME_ARGS = ("--renderer", "--started-at", "--completed-at", "--generated-at")


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
class WorkspaceNextAction:
    name: str
    command: tuple[str, ...] = ()
    requires_runtime_args: tuple[str, ...] = ()
    writes_files: bool = False
    requires: tuple[str, ...] = ()


@dataclass(frozen=True)
class WorkspaceHealthSummary:
    workspace_root: Path
    render_tasks: WorkspaceArtifactHealth
    render_status: WorkspaceArtifactHealth
    scheduler_report: WorkspaceArtifactHealth
    shoot_slug: str | None
    render_plan_fingerprint: str | None
    task_count: int
    status_counts: WorkspaceRenderStatusCounts
    next_action: WorkspaceNextAction
    safety_notes: tuple[str, ...]


def build_workspace_health_summary(workspace_root: Path | str) -> WorkspaceHealthSummary:
    """Summarize trusted ShootFlow handoffs without creating or repairing files."""

    root = _workspace_root(workspace_root)
    render_tasks_path = root / RENDER_TASKS_MANIFEST_PATH
    render_status_path = root / RENDER_STATUS_MANIFEST_PATH
    scheduler_report_path = root / RENDER_SCHEDULER_REPORT_PATH

    trusted_plan: AssemblyPlan | None = None
    render_status_manifest: RenderStatusManifest | None = None

    if _path_exists_or_is_symlink(render_tasks_path):
        try:
            trusted_plan = load_trusted_render_tasks_manifest(root)
            render_tasks = WorkspaceArtifactHealth(
                path=render_tasks_path,
                exists=True,
                valid=True,
            )
        except (AssemblyPlanError, OSError, FileNotFoundError) as exc:
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
            load_dry_run_render_scheduler_report(
                root,
                trusted_plan=trusted_plan,
                final_manifest=render_status_manifest,
            )
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
    summary = WorkspaceHealthSummary(
        workspace_root=root,
        render_tasks=render_tasks,
        render_status=render_status,
        scheduler_report=scheduler_report,
        shoot_slug=None if trusted_plan is None else trusted_plan.shoot_slug,
        render_plan_fingerprint=(
            None if trusted_plan is None else render_plan_fingerprint(trusted_plan)
        ),
        task_count=0 if trusted_plan is None else len(trusted_plan.render_tasks),
        status_counts=status_counts,
        next_action=_next_action(
            root,
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
        "render_plan_fingerprint": summary.render_plan_fingerprint,
        "task_count": summary.task_count,
        "artifacts": {
            "render_tasks": _artifact_to_dict(summary.render_tasks),
            "render_status": _artifact_to_dict(summary.render_status),
            "scheduler_report": _artifact_to_dict(summary.scheduler_report),
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
    if root.exists() and not root.is_dir():
        raise WorkspaceHealthError(f"Workspace root must be a directory: {root}")
    return root


def _path_exists_or_is_symlink(path: Path) -> bool:
    return path.exists() or path.is_symlink()


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


def _next_action(
    workspace_root: Path,
    *,
    trusted_plan: AssemblyPlan | None,
    render_tasks: WorkspaceArtifactHealth,
    render_status: WorkspaceArtifactHealth,
    scheduler_report: WorkspaceArtifactHealth,
    status_counts: WorkspaceRenderStatusCounts,
) -> WorkspaceNextAction:
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


def _validate_summary(summary: WorkspaceHealthSummary) -> None:
    if not isinstance(summary, WorkspaceHealthSummary):
        raise WorkspaceHealthError("summary must be a WorkspaceHealthSummary")
    if not isinstance(summary.workspace_root, Path):
        raise WorkspaceHealthError("summary workspace_root must be a Path")
    if summary.task_count < 0:
        raise WorkspaceHealthError("summary task_count cannot be negative")
