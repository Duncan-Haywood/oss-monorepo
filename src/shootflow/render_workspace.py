from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from shootflow.assembly import AssemblyPlan, load_trusted_render_tasks_manifest
from shootflow.render_scheduler import (
    RENDER_SCHEDULER_REPORT_PATH,
    DryRunRenderSchedulerError,
    DryRunRenderSchedulerReport,
    load_dry_run_render_scheduler_report,
)
from shootflow.render_status import (
    RENDER_STATUS_MANIFEST_PATH,
    RenderStatusError,
    RenderStatusManifest,
    build_initial_render_status_manifest,
    load_render_status_manifest,
    render_plan_fingerprint,
)


class RenderWorkspaceError(ValueError):
    """Raised when persisted render workspace state cannot be trusted."""


@dataclass(frozen=True)
class RenderWorkspaceReport:
    workspace_root: Path
    shoot_slug: str
    render_plan_fingerprint: str
    status: str
    status_manifest_present: bool
    scheduler_report_present: bool
    task_counts_by_state: dict[str, int]
    expected_outputs: tuple[str, ...]
    materialized_outputs: tuple[str, ...]
    review_required_task_ids: tuple[str, ...]
    safe_next_actions: tuple[str, ...]


def inspect_render_workspace(workspace_root: Path | str) -> RenderWorkspaceReport:
    """Summarize persisted render handoffs without initializing, scheduling, or writing files."""

    root = _workspace_root(workspace_root)
    trusted_plan = load_trusted_render_tasks_manifest(root)
    status_path = root / RENDER_STATUS_MANIFEST_PATH
    scheduler_report_path = root / RENDER_SCHEDULER_REPORT_PATH
    status_manifest_present = status_path.exists()
    scheduler_report_present = scheduler_report_path.exists()

    if not status_manifest_present:
        if scheduler_report_present:
            raise RenderWorkspaceError("Cannot trust scheduler report without render status manifest")
        manifest = build_initial_render_status_manifest(trusted_plan)
        return _workspace_report(
            root,
            trusted_plan=trusted_plan,
            status_manifest=manifest,
            scheduler_report=None,
            status="needs_status_initialization",
            status_manifest_present=False,
            scheduler_report_present=False,
        )

    try:
        status_manifest = load_render_status_manifest(root, trusted_plan=trusted_plan)
    except RenderStatusError as exc:
        raise RenderWorkspaceError("Cannot inspect render workspace with untrusted status manifest") from exc

    scheduler_report: DryRunRenderSchedulerReport | None = None
    if scheduler_report_present:
        try:
            scheduler_report = load_dry_run_render_scheduler_report(
                root,
                trusted_plan=trusted_plan,
                final_manifest=status_manifest,
            )
        except DryRunRenderSchedulerError as exc:
            raise RenderWorkspaceError("Cannot inspect render workspace with untrusted scheduler report") from exc

    return _workspace_report(
        root,
        trusted_plan=trusted_plan,
        status_manifest=status_manifest,
        scheduler_report=scheduler_report,
        status=_workspace_status(status_manifest, scheduler_report=scheduler_report),
        status_manifest_present=True,
        scheduler_report_present=scheduler_report_present,
    )


def _workspace_report(
    root: Path,
    *,
    trusted_plan: AssemblyPlan,
    status_manifest: RenderStatusManifest,
    scheduler_report: DryRunRenderSchedulerReport | None,
    status: str,
    status_manifest_present: bool,
    scheduler_report_present: bool,
) -> RenderWorkspaceReport:
    report = RenderWorkspaceReport(
        workspace_root=root,
        shoot_slug=trusted_plan.shoot_slug,
        render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
        status=status,
        status_manifest_present=status_manifest_present,
        scheduler_report_present=scheduler_report_present,
        task_counts_by_state=_task_counts_by_state(status_manifest),
        expected_outputs=_expected_outputs(trusted_plan),
        materialized_outputs=_materialized_outputs(root, trusted_plan),
        review_required_task_ids=_review_required_task_ids(status_manifest, scheduler_report),
        safe_next_actions=_safe_next_actions(status, scheduler_report=scheduler_report),
    )
    _validate_report(report, trusted_plan=trusted_plan)
    return report


def _workspace_root(workspace_root: Path | str) -> Path:
    if not isinstance(workspace_root, (Path, str)):
        raise RenderWorkspaceError("workspace_root must be a path")
    root = Path(workspace_root)
    if root.is_symlink():
        raise RenderWorkspaceError(f"Refusing render workspace symlink: {root}")
    return root


def _task_counts_by_state(status_manifest: RenderStatusManifest) -> dict[str, int]:
    counts = {
        "pending": 0,
        "running": 0,
        "succeeded": 0,
        "failed": 0,
        "retryable": 0,
    }
    for status in status_manifest.task_statuses:
        counts[status.state] += 1
    return counts


def _expected_outputs(trusted_plan: AssemblyPlan) -> tuple[str, ...]:
    outputs: list[str] = []
    for task in trusted_plan.render_tasks:
        outputs.extend(task.outputs)
    return tuple(outputs)


def _materialized_outputs(root: Path, trusted_plan: AssemblyPlan) -> tuple[str, ...]:
    materialized: list[str] = []
    for output in _expected_outputs(trusted_plan):
        output_path = root / output
        if output_path.is_symlink():
            raise RenderWorkspaceError(f"Refusing symlinked render output: {output}")
        if output_path.is_file():
            materialized.append(output)
    return tuple(materialized)


def _review_required_task_ids(
    status_manifest: RenderStatusManifest,
    scheduler_report: DryRunRenderSchedulerReport | None,
) -> tuple[str, ...]:
    seen: set[str] = set()
    task_ids: list[str] = []
    for status in status_manifest.task_statuses:
        if status.state in {"failed", "retryable"}:
            seen.add(status.task_id)
            task_ids.append(status.task_id)
    if scheduler_report is None:
        return tuple(task_ids)
    for task_id in scheduler_report.review_required_task_ids:
        if task_id in seen:
            continue
        seen.add(task_id)
        task_ids.append(task_id)
    return tuple(task_ids)


def _workspace_status(
    status_manifest: RenderStatusManifest,
    *,
    scheduler_report: DryRunRenderSchedulerReport | None,
) -> str:
    counts = _task_counts_by_state(status_manifest)
    if counts["failed"] or counts["retryable"]:
        return "needs_review"
    if counts["running"]:
        return "running"
    if counts["succeeded"] == len(status_manifest.task_statuses):
        return "complete"
    if scheduler_report is not None and scheduler_report.blocked_task_ids:
        return "blocked"
    return "ready_to_schedule"


def _safe_next_actions(
    status: str,
    *,
    scheduler_report: DryRunRenderSchedulerReport | None,
) -> tuple[str, ...]:
    if status == "needs_status_initialization":
        return ("initialize_render_status",)
    if status == "complete":
        return ("review_deliverables",)
    if status == "needs_review":
        return ("review_render_failures",)
    if status == "blocked":
        return ("review_missing_dependencies",)
    if status == "running":
        return ("wait_for_running_renders",)
    if status == "ready_to_schedule":
        if scheduler_report is not None and scheduler_report.stopped_reason == "waiting":
            return ("review_pending_dependencies",)
        return ("run_render_scheduler",)
    raise RenderWorkspaceError(f"Unknown render workspace status: {status}")


def _validate_report(report: RenderWorkspaceReport, *, trusted_plan: AssemblyPlan) -> None:
    if not isinstance(report.workspace_root, Path):
        raise RenderWorkspaceError("workspace_root must be a Path")
    if report.shoot_slug != trusted_plan.shoot_slug:
        raise RenderWorkspaceError("workspace shoot_slug does not match trusted plan")
    if report.render_plan_fingerprint != render_plan_fingerprint(trusted_plan):
        raise RenderWorkspaceError("workspace render_plan_fingerprint does not match trusted plan")
    if report.status not in {
        "needs_status_initialization",
        "ready_to_schedule",
        "blocked",
        "running",
        "needs_review",
        "complete",
    }:
        raise RenderWorkspaceError("workspace status is invalid")
    if set(report.task_counts_by_state) != {"pending", "running", "succeeded", "failed", "retryable"}:
        raise RenderWorkspaceError("workspace task counts are invalid")
    if sum(report.task_counts_by_state.values()) != len(trusted_plan.render_tasks):
        raise RenderWorkspaceError("workspace task counts do not match trusted plan")
