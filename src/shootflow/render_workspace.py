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

_STATE_KEYS = ("pending", "running", "succeeded", "failed", "retryable")


class RenderWorkspaceError(ValueError):
    """Raised when a render workspace summary cannot be trusted."""


@dataclass(frozen=True)
class RenderWorkspaceReport:
    workspace_root: Path
    render_tasks_manifest_path: Path
    render_status_manifest_path: Path
    scheduler_report_path: Path
    shoot_slug: str
    render_plan_fingerprint: str
    overall_status: str
    render_tasks_present: bool
    render_status_present: bool
    scheduler_report_present: bool
    task_count: int
    status_counts_by_state: dict[str, int]
    expected_output_paths: tuple[str, ...]
    scheduler_stopped_reason: str | None
    review_required_task_ids: tuple[str, ...]
    outputs_materialized: tuple[str, ...]
    next_actions: tuple[str, ...]
    safety_notes: tuple[str, ...]


def inspect_render_workspace(workspace_root: Path | str) -> RenderWorkspaceReport:
    """Summarize persisted render handoffs without creating or modifying files."""

    root = _workspace_root(workspace_root)
    trusted_plan = _load_trusted_plan(root)
    status_path = root / RENDER_STATUS_MANIFEST_PATH
    scheduler_report_path = root / RENDER_SCHEDULER_REPORT_PATH
    render_status_present = _path_present(status_path)
    scheduler_report_present = _path_present(scheduler_report_path)

    final_manifest: RenderStatusManifest | None = None
    if render_status_present:
        final_manifest = _load_status_manifest(root, trusted_plan=trusted_plan)
    elif scheduler_report_present:
        raise RenderWorkspaceError(
            "Cannot trust render scheduler report without render status manifest"
        )

    scheduler_report = None
    if scheduler_report_present:
        if final_manifest is None:
            raise RenderWorkspaceError(
                "Cannot trust render scheduler report without render status manifest"
            )
        try:
            scheduler_report = load_dry_run_render_scheduler_report(
                root,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )
        except DryRunRenderSchedulerError as exc:
            raise RenderWorkspaceError("Render scheduler report cannot be trusted") from exc

    report = RenderWorkspaceReport(
        workspace_root=root,
        render_tasks_manifest_path=root / RENDER_TASKS_MANIFEST_PATH,
        render_status_manifest_path=status_path,
        scheduler_report_path=scheduler_report_path,
        shoot_slug=trusted_plan.shoot_slug,
        render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
        overall_status=_overall_status(
            status_manifest=final_manifest,
            scheduler_stopped_reason=(
                None if scheduler_report is None else scheduler_report.stopped_reason
            ),
        ),
        render_tasks_present=True,
        render_status_present=render_status_present,
        scheduler_report_present=scheduler_report_present,
        task_count=len(trusted_plan.render_tasks),
        status_counts_by_state=_status_counts(final_manifest),
        expected_output_paths=tuple(
            output_path
            for task in trusted_plan.render_tasks
            for output_path in task.outputs
        ),
        scheduler_stopped_reason=(
            None if scheduler_report is None else scheduler_report.stopped_reason
        ),
        review_required_task_ids=(
            () if scheduler_report is None else scheduler_report.review_required_task_ids
        ),
        outputs_materialized=(
            () if scheduler_report is None else scheduler_report.outputs_materialized
        ),
        next_actions=_next_actions(
            status_manifest=final_manifest,
            scheduler_stopped_reason=(
                None if scheduler_report is None else scheduler_report.stopped_reason
            ),
            review_required_task_ids=(
                () if scheduler_report is None else scheduler_report.review_required_task_ids
            ),
        ),
        safety_notes=(
            "read-only inspection - no files were written",
            "source media deletion remains out of scope",
            "scheduler reports are validated against trusted render status before use",
        ),
    )
    _validate_report(report)
    return report


def _workspace_root(workspace_root: Path | str) -> Path:
    if not isinstance(workspace_root, (Path, str)):
        raise RenderWorkspaceError("workspace_root must be a pathlib.Path or string")
    root = Path(workspace_root)
    if root.is_symlink():
        raise RenderWorkspaceError(f"Refusing render workspace symlink: {root}")
    return root


def _load_trusted_plan(root: Path) -> AssemblyPlan:
    try:
        return load_trusted_render_tasks_manifest(root)
    except AssemblyPlanError as exc:
        raise RenderWorkspaceError("Render task manifest cannot be trusted") from exc


def _load_status_manifest(root: Path, *, trusted_plan: AssemblyPlan) -> RenderStatusManifest:
    try:
        return load_render_status_manifest(root, trusted_plan=trusted_plan)
    except RenderStatusError as exc:
        raise RenderWorkspaceError("Render status manifest cannot be trusted") from exc


def _path_present(path: Path) -> bool:
    return path.exists() or path.is_symlink()


def _overall_status(
    *,
    status_manifest: RenderStatusManifest | None,
    scheduler_stopped_reason: str | None,
) -> str:
    if status_manifest is None:
        return "needs_status_initialization"
    if scheduler_stopped_reason is not None:
        return scheduler_stopped_reason
    states = {status.state for status in status_manifest.task_statuses}
    if "failed" in states:
        return "failed"
    if "retryable" in states:
        return "retryable"
    if "running" in states:
        return "running"
    if "pending" in states:
        return "ready_to_schedule"
    return "complete"


def _status_counts(manifest: RenderStatusManifest | None) -> dict[str, int]:
    counts = {state: 0 for state in _STATE_KEYS}
    if manifest is None:
        return counts
    for status in manifest.task_statuses:
        counts[status.state] += 1
    return counts


def _next_actions(
    *,
    status_manifest: RenderStatusManifest | None,
    scheduler_stopped_reason: str | None,
    review_required_task_ids: tuple[str, ...],
) -> tuple[str, ...]:
    if status_manifest is None:
        return ("run init-render-status",)
    if review_required_task_ids:
        return ("review scheduler report tasks before retry",)
    if scheduler_stopped_reason == "complete":
        return ("review completed deliverables",)
    if scheduler_stopped_reason == "waiting":
        return ("complete missing dependencies then rerun scheduler",)
    if scheduler_stopped_reason == "blocked":
        return ("review blocked dependencies then rerun scheduler",)
    if scheduler_stopped_reason in {"retryable", "failed", "max_iterations"}:
        return ("review render status and scheduler report before retry",)
    states = {status.state for status in status_manifest.task_statuses}
    if "running" in states:
        return ("wait for running render tasks or expire stale leases",)
    return ("run dry-run-render-scheduler",)


def _validate_report(report: RenderWorkspaceReport) -> None:
    if not isinstance(report, RenderWorkspaceReport):
        raise RenderWorkspaceError("report must be a RenderWorkspaceReport")
    if not isinstance(report.workspace_root, Path):
        raise RenderWorkspaceError("workspace_root must be a Path")
    if not isinstance(report.shoot_slug, str) or not report.shoot_slug.strip():
        raise RenderWorkspaceError("shoot_slug cannot be empty")
    if not isinstance(report.render_plan_fingerprint, str) or not report.render_plan_fingerprint.strip():
        raise RenderWorkspaceError("render_plan_fingerprint cannot be empty")
    if not isinstance(report.overall_status, str) or not report.overall_status.strip():
        raise RenderWorkspaceError("overall_status cannot be empty")
    if (
        isinstance(report.task_count, bool)
        or not isinstance(report.task_count, int)
        or report.task_count < 0
    ):
        raise RenderWorkspaceError("task_count must be a non-negative integer")
    if set(report.status_counts_by_state) != set(_STATE_KEYS):
        raise RenderWorkspaceError("status_counts_by_state has unexpected states")
    for state, count in report.status_counts_by_state.items():
        if state not in _STATE_KEYS or isinstance(count, bool) or not isinstance(count, int) or count < 0:
            raise RenderWorkspaceError("status_counts_by_state contains invalid counts")
    for field_name in (
        "expected_output_paths",
        "review_required_task_ids",
        "outputs_materialized",
        "next_actions",
        "safety_notes",
    ):
        value = getattr(report, field_name)
        if not isinstance(value, tuple):
            raise RenderWorkspaceError(f"{field_name} must be a tuple")
        for item in value:
            if not isinstance(item, str) or not item.strip():
                raise RenderWorkspaceError(f"{field_name} contains invalid strings")
