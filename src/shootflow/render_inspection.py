from __future__ import annotations

import errno
import hashlib
import os
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from shootflow.assembly import AssemblyPlan, load_trusted_render_tasks_manifest
from shootflow.render_status import (
    OutputChecksum,
    RenderStatusManifest,
    RenderTaskStatus,
    load_render_status_manifest,
)

OutputInspectionState = Literal[
    "verified",
    "missing",
    "checksum_mismatch",
    "unsafe_path",
    "not_a_file",
    "unreadable",
]
RenderInspectionStatus = Literal["verified", "in_progress", "review_required"]

_PROBLEM_OUTPUT_STATES = frozenset(
    {"missing", "checksum_mismatch", "unsafe_path", "not_a_file", "unreadable"}
)
_REVIEW_REQUIRED_STATUS_STATES = frozenset({"running", "failed", "retryable"})


class RenderInspectionError(ValueError):
    """Raised when a render workspace cannot be inspected safely."""


@dataclass(frozen=True)
class OutputInspection:
    task_id: str
    path: str
    state: OutputInspectionState
    expected_sha256: str
    actual_sha256: str | None = None
    message: str | None = None


@dataclass(frozen=True)
class RenderWorkspaceInspectionReport:
    workspace: Path
    shoot_slug: str
    render_plan_fingerprint: str
    status: RenderInspectionStatus
    task_count: int
    pending_task_ids: tuple[str, ...]
    running_task_ids: tuple[str, ...]
    succeeded_task_ids: tuple[str, ...]
    failed_task_ids: tuple[str, ...]
    retryable_task_ids: tuple[str, ...]
    verified_output_paths: tuple[str, ...]
    output_inspections: tuple[OutputInspection, ...]
    review_required_task_ids: tuple[str, ...]
    notes: tuple[str, ...]


def inspect_render_workspace(workspace_root: Path | str) -> RenderWorkspaceInspectionReport:
    """Inspect trusted persisted render state without changing workspace files."""

    if not isinstance(workspace_root, (Path, str)):
        raise TypeError("workspace_root must be a path")
    root = Path(workspace_root)
    if root.is_symlink():
        raise RenderInspectionError(f"Refusing render inspection workspace symlink: {root}")
    root = root.absolute()

    trusted_plan = load_trusted_render_tasks_manifest(root, verify_inputs=False)
    manifest = load_render_status_manifest(root, trusted_plan=trusted_plan)
    report = _inspection_report(root, trusted_plan=trusted_plan, manifest=manifest)
    if not isinstance(report, RenderWorkspaceInspectionReport):
        raise RenderInspectionError("render inspection did not return a report")
    return report


def _inspection_report(
    root: Path,
    *,
    trusted_plan: AssemblyPlan,
    manifest: RenderStatusManifest,
) -> RenderWorkspaceInspectionReport:
    output_inspections: list[OutputInspection] = []
    verified_output_paths: list[str] = []
    review_required_task_ids: list[str] = []

    for status in manifest.task_statuses:
        task_needs_review = status.state in _REVIEW_REQUIRED_STATUS_STATES
        if status.state == "succeeded":
            task_output_inspections = _inspect_succeeded_outputs(root, status)
            output_inspections.extend(task_output_inspections)
            verified_output_paths.extend(
                inspection.path
                for inspection in task_output_inspections
                if inspection.state == "verified"
            )
            task_needs_review = any(
                inspection.state in _PROBLEM_OUTPUT_STATES
                for inspection in task_output_inspections
            )
        if task_needs_review:
            review_required_task_ids.append(status.task_id)

    pending_task_ids = _task_ids_by_state(manifest, "pending")
    running_task_ids = _task_ids_by_state(manifest, "running")
    succeeded_task_ids = _task_ids_by_state(manifest, "succeeded")
    failed_task_ids = _task_ids_by_state(manifest, "failed")
    retryable_task_ids = _task_ids_by_state(manifest, "retryable")
    inspection_status = _inspection_status(
        review_required_task_ids=tuple(review_required_task_ids),
        pending_task_ids=pending_task_ids,
        running_task_ids=running_task_ids,
        succeeded_task_ids=succeeded_task_ids,
        task_count=len(manifest.task_statuses),
    )

    return RenderWorkspaceInspectionReport(
        workspace=root,
        shoot_slug=manifest.shoot_slug,
        render_plan_fingerprint=manifest.render_plan_fingerprint,
        status=inspection_status,
        task_count=len(manifest.task_statuses),
        pending_task_ids=pending_task_ids,
        running_task_ids=running_task_ids,
        succeeded_task_ids=succeeded_task_ids,
        failed_task_ids=failed_task_ids,
        retryable_task_ids=retryable_task_ids,
        verified_output_paths=tuple(verified_output_paths),
        output_inspections=tuple(output_inspections),
        review_required_task_ids=tuple(review_required_task_ids),
        notes=(
            "read-only inspection - no render status, scheduler report, or deliverable files were written",
            "source, graded, and deliverable files are never deleted or repaired by inspection",
            "review-required tasks need human or scheduler follow-up before delivery",
        ),
    )


def _inspect_succeeded_outputs(root: Path, status: RenderTaskStatus) -> tuple[OutputInspection, ...]:
    inspections: list[OutputInspection] = []
    for checksum in status.output_checksums:
        inspections.append(_inspect_output_checksum(root, status.task_id, checksum))
    return tuple(inspections)


def _inspect_output_checksum(
    root: Path,
    task_id: str,
    checksum: OutputChecksum,
) -> OutputInspection:
    try:
        output_path = _workspace_output_path(root, checksum.path)
        _reject_symlink_path(output_path, root, "render output")
    except RenderInspectionError as exc:
        return OutputInspection(
            task_id=task_id,
            path=checksum.path,
            state="unsafe_path",
            expected_sha256=checksum.sha256,
            message=str(exc),
        )

    try:
        actual_sha256 = _sha256_regular_file(output_path)
    except FileNotFoundError:
        return OutputInspection(
            task_id=task_id,
            path=checksum.path,
            state="missing",
            expected_sha256=checksum.sha256,
            message=f"Missing render output: {checksum.path}",
        )
    except IsADirectoryError:
        return OutputInspection(
            task_id=task_id,
            path=checksum.path,
            state="not_a_file",
            expected_sha256=checksum.sha256,
            message=f"Render output is not a file: {checksum.path}",
        )
    except RenderInspectionError as exc:
        return OutputInspection(
            task_id=task_id,
            path=checksum.path,
            state="unsafe_path",
            expected_sha256=checksum.sha256,
            message=str(exc),
        )
    except OSError as exc:
        return OutputInspection(
            task_id=task_id,
            path=checksum.path,
            state="unreadable",
            expected_sha256=checksum.sha256,
            message=f"Unable to checksum render output: {checksum.path}: {exc}",
        )

    if actual_sha256 != checksum.sha256:
        return OutputInspection(
            task_id=task_id,
            path=checksum.path,
            state="checksum_mismatch",
            expected_sha256=checksum.sha256,
            actual_sha256=actual_sha256,
            message=f"Checksum mismatch for render output: {checksum.path}",
        )

    return OutputInspection(
        task_id=task_id,
        path=checksum.path,
        state="verified",
        expected_sha256=checksum.sha256,
        actual_sha256=actual_sha256,
    )


def _sha256_regular_file(path: Path) -> str:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    if hasattr(os, "O_NONBLOCK"):
        flags |= os.O_NONBLOCK
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        if exc.errno == errno.ELOOP:
            raise RenderInspectionError(f"Refusing render output symlink: {path}") from exc
        raise

    try:
        file_stat = os.fstat(fd)
        if not stat.S_ISREG(file_stat.st_mode):
            raise IsADirectoryError(path)
        digest = hashlib.sha256()
        with os.fdopen(fd, "rb") as output_file:
            fd = -1
            for chunk in iter(lambda: output_file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    finally:
        if fd != -1:
            os.close(fd)


def _workspace_output_path(root: Path, output: str) -> Path:
    relative_output = Path(output)
    if relative_output.is_absolute() or ".." in relative_output.parts:
        raise RenderInspectionError(f"Unsafe render output path: {output}")
    if not relative_output.parts or relative_output.parts[0] != "deliverables":
        raise RenderInspectionError(f"Unexpected render output path: {output}")
    output_path = root / relative_output
    try:
        output_path.relative_to(root)
    except ValueError as exc:
        raise RenderInspectionError(f"Render output escapes workspace: {output}") from exc
    return output_path


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    current = path
    while True:
        if current.is_symlink():
            raise RenderInspectionError(f"Refusing {label} symlink: {current}")
        if current == root or current.absolute() == root.absolute():
            return
        parent = current.parent
        if parent == current:
            return
        current = parent


def _task_ids_by_state(
    manifest: RenderStatusManifest,
    state: str,
) -> tuple[str, ...]:
    return tuple(status.task_id for status in manifest.task_statuses if status.state == state)


def _inspection_status(
    *,
    review_required_task_ids: tuple[str, ...],
    pending_task_ids: tuple[str, ...],
    running_task_ids: tuple[str, ...],
    succeeded_task_ids: tuple[str, ...],
    task_count: int,
) -> RenderInspectionStatus:
    if review_required_task_ids:
        return "review_required"
    if len(succeeded_task_ids) == task_count:
        return "verified"
    if pending_task_ids or running_task_ids:
        return "in_progress"
    return "review_required"
