from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

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
from shootflow.story import STORYLINE_ARTIFACT_PATH

WorkspaceArtifactStatus = Literal["missing", "present", "trusted", "invalid"]
WORKSPACE_STATE_SCHEMA_VERSION = 1
INGEST_MANIFEST_PATH = "ingest_manifest.json"

_RENDER_STATES = ("pending", "running", "succeeded", "failed", "retryable")


class WorkspaceStateError(ValueError):
    """Raised when a workspace state report cannot be constructed safely."""


@dataclass(frozen=True)
class WorkspaceArtifactState:
    name: str
    path: Path
    status: WorkspaceArtifactStatus
    size_bytes: int | None = None
    sha256: str | None = None
    error_message: str | None = None


@dataclass(frozen=True)
class WorkspaceStateReport:
    workspace: Path
    artifacts: tuple[WorkspaceArtifactState, ...]
    shoot_slug: str | None
    render_plan_fingerprint: str | None
    render_status_counts: dict[str, int]
    scheduler_stopped_reason: str | None
    review_required_task_ids: tuple[str, ...]
    next_actions: tuple[str, ...]
    notes: tuple[str, ...]


def build_workspace_state_report(workspace_root: Path | str) -> WorkspaceStateReport:
    """Inspect known ShootFlow handoff artifacts without writing to the workspace."""

    root = _workspace_root(workspace_root)
    trusted_plan: AssemblyPlan | None = None
    trusted_status: RenderStatusManifest | None = None
    shoot_slug: str | None = None
    fingerprint: str | None = None
    render_status_counts: dict[str, int] = {}
    scheduler_stopped_reason: str | None = None
    review_required_task_ids: tuple[str, ...] = ()

    ingest = _artifact_file_state(root, "ingest_manifest", INGEST_MANIFEST_PATH)
    storylines = _artifact_file_state(root, "storylines", STORYLINE_ARTIFACT_PATH)

    render_tasks = _artifact_file_state(root, "render_tasks", RENDER_TASKS_MANIFEST_PATH)
    if render_tasks.status == "present":
        try:
            trusted_plan = load_trusted_render_tasks_manifest(root)
            shoot_slug = trusted_plan.shoot_slug
            fingerprint = render_plan_fingerprint(trusted_plan)
            render_tasks = _with_status(render_tasks, "trusted")
        except (AssemblyPlanError, RenderStatusError, OSError) as exc:
            render_tasks = _with_status(render_tasks, "invalid", str(exc))

    render_status = _artifact_file_state(root, "render_status", RENDER_STATUS_MANIFEST_PATH)
    if render_status.status == "present" and trusted_plan is not None:
        try:
            trusted_status = load_render_status_manifest(root, trusted_plan=trusted_plan)
            render_status_counts = _status_counts(trusted_status)
            render_status = _with_status(render_status, "trusted")
        except (RenderStatusError, AssemblyPlanError, OSError) as exc:
            render_status = _with_status(render_status, "invalid", str(exc))

    scheduler_report = _artifact_file_state(
        root,
        "render_scheduler_report",
        RENDER_SCHEDULER_REPORT_PATH,
    )
    if (
        scheduler_report.status == "present"
        and trusted_plan is not None
        and trusted_status is not None
    ):
        try:
            loaded_scheduler_report = load_dry_run_render_scheduler_report(
                root,
                trusted_plan=trusted_plan,
                final_manifest=trusted_status,
            )
            scheduler_stopped_reason = loaded_scheduler_report.stopped_reason
            review_required_task_ids = loaded_scheduler_report.review_required_task_ids
            scheduler_report = _with_status(scheduler_report, "trusted")
        except (DryRunRenderSchedulerError, RenderStatusError, AssemblyPlanError, OSError) as exc:
            scheduler_report = _with_status(scheduler_report, "invalid", str(exc))

    artifacts = (
        ingest,
        storylines,
        render_tasks,
        render_status,
        scheduler_report,
    )
    state_report = WorkspaceStateReport(
        workspace=root,
        artifacts=artifacts,
        shoot_slug=shoot_slug,
        render_plan_fingerprint=fingerprint,
        render_status_counts=render_status_counts,
        scheduler_stopped_reason=scheduler_stopped_reason,
        review_required_task_ids=review_required_task_ids,
        next_actions=_next_actions(
            artifacts,
            trusted_plan=trusted_plan,
            trusted_status=trusted_status,
            scheduler_stopped_reason=scheduler_stopped_reason,
            review_required_task_ids=review_required_task_ids,
        ),
        notes=(
            "read-only workspace state inspection",
            "no source, graded, deliverable, status, or scheduler files were written",
        ),
    )
    _validate_report(state_report)
    return state_report


def _workspace_root(workspace_root: Path | str) -> Path:
    if not isinstance(workspace_root, (Path, str)):
        raise TypeError("workspace_root must be a path-like string")
    root = Path(workspace_root)
    if root.is_symlink():
        raise WorkspaceStateError(f"Refusing workspace symlink: {root}")
    if root.exists() and not root.is_dir():
        raise WorkspaceStateError(f"Workspace must be a directory: {root}")
    return root


def _artifact_file_state(
    root: Path,
    name: str,
    relative_path: str,
) -> WorkspaceArtifactState:
    path = root / relative_path
    try:
        _reject_symlink_path(path, root, f"{name} artifact")
    except WorkspaceStateError as exc:
        return WorkspaceArtifactState(
            name=name,
            path=path,
            status="invalid",
            error_message=str(exc),
        )
    if not path.exists():
        return WorkspaceArtifactState(name=name, path=path, status="missing")
    if not path.is_file():
        return WorkspaceArtifactState(
            name=name,
            path=path,
            status="invalid",
            error_message=f"Artifact must be a file: {path}",
        )
    try:
        size_bytes, sha256 = _file_metadata(path)
    except OSError:
        return WorkspaceArtifactState(
            name=name,
            path=path,
            status="invalid",
            error_message=f"Unable to inspect artifact: {path}",
        )
    return WorkspaceArtifactState(
        name=name,
        path=path,
        status="present",
        size_bytes=size_bytes,
        sha256=sha256,
    )


def _file_metadata(path: Path) -> tuple[int, str]:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    digest = hashlib.sha256()
    size_bytes = 0
    with os.fdopen(fd, "rb") as artifact_file:
        for chunk in iter(lambda: artifact_file.read(1024 * 1024), b""):
            size_bytes += len(chunk)
            digest.update(chunk)
    return size_bytes, digest.hexdigest()


def _with_status(
    artifact: WorkspaceArtifactState,
    status: WorkspaceArtifactStatus,
    error_message: str | None = None,
) -> WorkspaceArtifactState:
    return WorkspaceArtifactState(
        name=artifact.name,
        path=artifact.path,
        status=status,
        size_bytes=artifact.size_bytes,
        sha256=artifact.sha256,
        error_message=error_message,
    )


def _status_counts(manifest: RenderStatusManifest) -> dict[str, int]:
    counts = {state: 0 for state in _RENDER_STATES}
    for status in manifest.task_statuses:
        counts[status.state] += 1
    return counts


def _next_actions(
    artifacts: tuple[WorkspaceArtifactState, ...],
    *,
    trusted_plan: AssemblyPlan | None,
    trusted_status: RenderStatusManifest | None,
    scheduler_stopped_reason: str | None,
    review_required_task_ids: tuple[str, ...],
) -> tuple[str, ...]:
    by_name = {artifact.name: artifact for artifact in artifacts}
    actions: list[str] = []

    if by_name["render_tasks"].status == "invalid":
        actions.append(
            "Review invalid render_tasks.json; do not hand it to workers until it is regenerated from trusted storyline selections."
        )
    elif trusted_plan is None:
        if by_name["ingest_manifest"].status == "present":
            actions.append("Run plan-production to review manifest-backed production waves.")
        else:
            actions.append("Create or select a shoot workspace with an ingest_manifest.json.")
    elif by_name["render_status"].status == "missing":
        actions.append("Run init-render-status to create the render progress handoff.")
    elif by_name["render_status"].status == "invalid":
        actions.append(
            "Review invalid render_status.json; do not initialize a new status handoff until the invalid file is resolved."
        )
    elif trusted_status is not None and by_name["render_scheduler_report"].status == "missing":
        actions.append("Run dry-run-render-scheduler to advance ready deliverable work.")
    elif by_name["render_scheduler_report"].status == "invalid":
        actions.append(
            "Review invalid render_scheduler_report.json; rerun the trusted scheduler only after confirming it is safe to replace the report."
        )
    elif review_required_task_ids:
        actions.append("Review retryable, failed, or blocked render tasks before rerunning scheduler.")
    elif scheduler_stopped_reason == "complete":
        actions.append("Review materialized deliverables and approve or iterate the edit package.")
    else:
        actions.append("Inspect current artifacts and choose the next safe workflow step.")

    return tuple(actions)


def _validate_report(report: WorkspaceStateReport) -> None:
    if not isinstance(report, WorkspaceStateReport):
        raise WorkspaceStateError("report must be a WorkspaceStateReport")
    if not isinstance(report.workspace, Path):
        raise WorkspaceStateError("workspace must be a Path")
    if not isinstance(report.artifacts, tuple) or not report.artifacts:
        raise WorkspaceStateError("artifacts must be a non-empty tuple")
    seen_names: set[str] = set()
    for artifact in report.artifacts:
        _validate_artifact(artifact)
        if artifact.name in seen_names:
            raise WorkspaceStateError(f"Duplicate workspace artifact: {artifact.name}")
        seen_names.add(artifact.name)
    if report.shoot_slug is not None and (
        not isinstance(report.shoot_slug, str) or not report.shoot_slug.strip()
    ):
        raise WorkspaceStateError("shoot_slug must be null or a non-empty string")
    if report.render_plan_fingerprint is not None and (
        not isinstance(report.render_plan_fingerprint, str)
        or len(report.render_plan_fingerprint) != 64
    ):
        raise WorkspaceStateError("render_plan_fingerprint must be null or a SHA-256 digest")
    if not isinstance(report.render_status_counts, dict):
        raise WorkspaceStateError("render_status_counts must be a dictionary")
    for key, value in report.render_status_counts.items():
        if key not in _RENDER_STATES or isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise WorkspaceStateError("render_status_counts contains an invalid state count")
    _validate_optional_string(report.scheduler_stopped_reason, "scheduler_stopped_reason")
    _validate_string_tuple(report.review_required_task_ids, "review_required_task_ids")
    _validate_string_tuple(report.next_actions, "next_actions")
    _validate_string_tuple(report.notes, "notes")


def _validate_artifact(artifact: WorkspaceArtifactState) -> None:
    if not isinstance(artifact, WorkspaceArtifactState):
        raise WorkspaceStateError("artifact must be a WorkspaceArtifactState")
    if not isinstance(artifact.name, str) or not artifact.name.strip():
        raise WorkspaceStateError("artifact name cannot be empty")
    if not isinstance(artifact.path, Path):
        raise WorkspaceStateError("artifact path must be a Path")
    if artifact.status not in {"missing", "present", "trusted", "invalid"}:
        raise WorkspaceStateError(f"Unsupported artifact status: {artifact.status}")
    if artifact.size_bytes is not None and (
        isinstance(artifact.size_bytes, bool)
        or not isinstance(artifact.size_bytes, int)
        or artifact.size_bytes < 0
    ):
        raise WorkspaceStateError("artifact size_bytes must be null or a non-negative integer")
    if artifact.sha256 is not None and (
        not isinstance(artifact.sha256, str) or len(artifact.sha256) != 64
    ):
        raise WorkspaceStateError("artifact sha256 must be null or a SHA-256 digest")
    if artifact.error_message is not None and (
        not isinstance(artifact.error_message, str) or not artifact.error_message.strip()
    ):
        raise WorkspaceStateError("artifact error_message must be null or a non-empty string")


def _validate_optional_string(value: str | None, label: str) -> None:
    if value is None:
        return
    if not isinstance(value, str) or not value.strip():
        raise WorkspaceStateError(f"{label} must be null or a non-empty string")


def _validate_string_tuple(value: tuple[str, ...], label: str) -> None:
    if not isinstance(value, tuple):
        raise WorkspaceStateError(f"{label} must be a tuple")
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise WorkspaceStateError(f"{label} must contain non-empty strings")


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    try:
        if path.is_symlink():
            raise WorkspaceStateError(f"Refusing symlinked {label}: {path}")
    except OSError as exc:
        raise WorkspaceStateError(f"Unable to inspect {label}: {path}") from exc
    current = path.parent
    while current != root and current != current.parent:
        try:
            if current.exists() and current.is_symlink():
                raise WorkspaceStateError(f"Refusing symlinked parent for {label}: {current}")
        except OSError as exc:
            raise WorkspaceStateError(f"Unable to inspect parent for {label}: {current}") from exc
        current = current.parent
