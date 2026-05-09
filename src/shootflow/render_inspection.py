from __future__ import annotations

import errno
import hashlib
import os
import stat
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Literal

from shootflow.assembly import AssemblyPlan, load_trusted_render_tasks_manifest
from shootflow.render_status import (
    RenderStatusManifest,
    load_render_status_manifest,
    validate_render_status_manifest,
)

OutputInspectionState = Literal[
    "verified",
    "missing",
    "checksum_mismatch",
    "unsafe_path",
    "not_a_file",
    "unreadable",
]

_INSPECTION_SCHEMA_VERSION = 1
_OUTPUT_STATES = frozenset(
    {"verified", "missing", "checksum_mismatch", "unsafe_path", "not_a_file", "unreadable"}
)
_RENDER_STATES = ("pending", "running", "succeeded", "failed", "retryable")
_REVIEW_REQUIRED_STATES = frozenset({"failed", "retryable"})


class RenderInspectionError(ValueError):
    """Raised when a render workspace cannot be inspected safely."""


@dataclass(frozen=True)
class RenderOutputInspection:
    task_id: str
    path: str
    state: OutputInspectionState
    expected_sha256: str
    actual_sha256: str | None = None
    message: str | None = None


@dataclass(frozen=True)
class RenderWorkspaceInspectionReport:
    schema_version: int
    shoot_slug: str
    render_plan_fingerprint: str
    total_task_count: int
    status_counts: Mapping[str, int]
    pending_task_ids: tuple[str, ...]
    running_task_ids: tuple[str, ...]
    succeeded_task_ids: tuple[str, ...]
    failed_task_ids: tuple[str, ...]
    retryable_task_ids: tuple[str, ...]
    outputs: tuple[RenderOutputInspection, ...]
    verified_output_count: int
    review_required_task_ids: tuple[str, ...]
    notes: tuple[str, ...]


def inspect_render_workspace(workspace_root: Path | str) -> RenderWorkspaceInspectionReport:
    """Inspect declared succeeded render outputs without retrying or writing files.

    Inspection starts from the strict persisted render-task and render-status
    manifests. Unlike worker/scheduler startup, it does not require upstream
    analysis or graded input files to remain present; this lets a UI or
    continuation agent verify already-rendered deliverables after source
    intermediates have been archived.
    """

    if not isinstance(workspace_root, (Path, str)):
        raise TypeError("workspace_root must be a Path or string")
    root = Path(workspace_root)
    trusted_plan = load_trusted_render_tasks_manifest(root, verify_inputs=False)
    status_manifest = load_render_status_manifest(root, trusted_plan=trusted_plan)
    return build_render_workspace_inspection_report(
        root,
        trusted_plan=trusted_plan,
        status_manifest=status_manifest,
    )


def build_render_workspace_inspection_report(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
    status_manifest: RenderStatusManifest,
) -> RenderWorkspaceInspectionReport:
    if not isinstance(workspace_root, (Path, str)):
        raise TypeError("workspace_root must be a Path or string")
    if not isinstance(trusted_plan, AssemblyPlan):
        raise TypeError("trusted_plan must be an AssemblyPlan")
    if not isinstance(status_manifest, RenderStatusManifest):
        raise TypeError("status_manifest must be a RenderStatusManifest")

    root = Path(workspace_root)
    validate_render_status_manifest(status_manifest, trusted_plan=trusted_plan)
    outputs = _inspect_succeeded_outputs(root, status_manifest)
    review_required_task_ids = _review_required_task_ids(
        trusted_plan,
        status_manifest=status_manifest,
        outputs=outputs,
    )
    report = RenderWorkspaceInspectionReport(
        schema_version=_INSPECTION_SCHEMA_VERSION,
        shoot_slug=status_manifest.shoot_slug,
        render_plan_fingerprint=status_manifest.render_plan_fingerprint,
        total_task_count=len(status_manifest.task_statuses),
        status_counts=MappingProxyType(_status_counts(status_manifest)),
        pending_task_ids=_task_ids_with_state(status_manifest, "pending"),
        running_task_ids=_task_ids_with_state(status_manifest, "running"),
        succeeded_task_ids=_task_ids_with_state(status_manifest, "succeeded"),
        failed_task_ids=_task_ids_with_state(status_manifest, "failed"),
        retryable_task_ids=_task_ids_with_state(status_manifest, "retryable"),
        outputs=outputs,
        verified_output_count=sum(1 for output in outputs if output.state == "verified"),
        review_required_task_ids=review_required_task_ids,
        notes=(
            "read-only inspection - no files were created, overwritten, retried, cleaned, or deleted",
            "only declared succeeded deliverable outputs were checksummed",
            "failed, retryable, missing, mismatched, unsafe, non-file, or unreadable outputs require review",
        ),
    )
    _validate_report(report)
    return report


def _inspect_succeeded_outputs(
    root: Path,
    status_manifest: RenderStatusManifest,
) -> tuple[RenderOutputInspection, ...]:
    outputs: list[RenderOutputInspection] = []
    for status_entry in status_manifest.task_statuses:
        if status_entry.state != "succeeded":
            continue
        for checksum in status_entry.output_checksums:
            outputs.append(
                _inspect_output(
                    root,
                    task_id=status_entry.task_id,
                    relative_path=checksum.path,
                    expected_sha256=checksum.sha256,
                )
            )
    return tuple(outputs)


def _inspect_output(
    root: Path,
    *,
    task_id: str,
    relative_path: str,
    expected_sha256: str,
) -> RenderOutputInspection:
    try:
        _workspace_output_path(root, relative_path)
        actual_sha256 = _sha256_regular_workspace_file(root, relative_path)
    except FileNotFoundError:
        return RenderOutputInspection(
            task_id=task_id,
            path=relative_path,
            state="missing",
            expected_sha256=expected_sha256,
            message="Declared succeeded output is missing.",
        )
    except _UnsafeOutputPathError as exc:
        return RenderOutputInspection(
            task_id=task_id,
            path=relative_path,
            state="unsafe_path",
            expected_sha256=expected_sha256,
            message=str(exc),
        )
    except IsADirectoryError:
        return RenderOutputInspection(
            task_id=task_id,
            path=relative_path,
            state="not_a_file",
            expected_sha256=expected_sha256,
            message="Declared succeeded output is not a regular file.",
        )
    except PermissionError as exc:
        return RenderOutputInspection(
            task_id=task_id,
            path=relative_path,
            state="unreadable",
            expected_sha256=expected_sha256,
            message=f"Declared succeeded output is unreadable: {exc}",
        )
    except OSError as exc:
        return RenderOutputInspection(
            task_id=task_id,
            path=relative_path,
            state="unreadable",
            expected_sha256=expected_sha256,
            message=f"Unable to checksum declared succeeded output: {exc}",
        )

    if actual_sha256 != expected_sha256:
        return RenderOutputInspection(
            task_id=task_id,
            path=relative_path,
            state="checksum_mismatch",
            expected_sha256=expected_sha256,
            actual_sha256=actual_sha256,
            message="Declared succeeded output checksum does not match render status.",
        )
    return RenderOutputInspection(
        task_id=task_id,
        path=relative_path,
        state="verified",
        expected_sha256=expected_sha256,
        actual_sha256=actual_sha256,
        message="Declared succeeded output matches render status checksum.",
    )


def _workspace_output_path(root: Path, relative_path: str) -> Path:
    if not isinstance(relative_path, str) or not relative_path.strip():
        raise _UnsafeOutputPathError("Render inspection output path cannot be empty.")
    artifact_path = Path(relative_path)
    if artifact_path.is_absolute() or ".." in artifact_path.parts:
        raise _UnsafeOutputPathError(f"Unsafe render inspection output path: {relative_path}")
    if not artifact_path.parts or artifact_path.parts[0] != "deliverables":
        raise _UnsafeOutputPathError(
            f"Render inspection output must be under deliverables: {relative_path}"
        )
    output_path = root / artifact_path
    try:
        output_path.relative_to(root)
    except ValueError as exc:
        raise _UnsafeOutputPathError(
            f"Render inspection output escapes workspace: {relative_path}"
        ) from exc
    return output_path


def _sha256_regular_workspace_file(root: Path, relative_path: str) -> str:
    parts = Path(relative_path).parts
    if not parts:
        raise _UnsafeOutputPathError("Render inspection output path cannot be empty.")

    root_fd = _open_root_directory(root)
    directory_fds: list[int] = []
    file_fd: int | None = None
    try:
        parent_fd = root_fd
        for component in parts[:-1]:
            directory_fd = _open_directory_component(parent_fd, component, relative_path)
            directory_fds.append(directory_fd)
            parent_fd = directory_fd
        file_fd = _open_file_component(parent_fd, parts[-1], relative_path)
        return _sha256_regular_file_descriptor(file_fd, relative_path)
    finally:
        if file_fd is not None:
            os.close(file_fd)
        for directory_fd in reversed(directory_fds):
            os.close(directory_fd)
        os.close(root_fd)


def _open_root_directory(root: Path) -> int:
    flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        flags |= os.O_DIRECTORY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    try:
        return os.open(root, flags)
    except OSError as exc:
        if exc.errno == errno.ELOOP:
            raise _UnsafeOutputPathError(f"Refusing render inspection workspace symlink: {root}") from exc
        raise


def _open_directory_component(parent_fd: int, component: str, relative_path: str) -> int:
    flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        flags |= os.O_DIRECTORY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    try:
        return os.open(component, flags, dir_fd=parent_fd)
    except OSError as exc:
        if exc.errno == errno.ELOOP or _component_is_symlink(parent_fd, component):
            raise _UnsafeOutputPathError(
                f"Refusing render inspection output directory symlink: {relative_path}"
            ) from exc
        if exc.errno == errno.ENOTDIR:
            raise IsADirectoryError(
                f"Declared succeeded output parent is not a directory: {relative_path}"
            ) from exc
        raise


def _open_file_component(parent_fd: int, component: str, relative_path: str) -> int:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    if hasattr(os, "O_NONBLOCK"):
        flags |= os.O_NONBLOCK
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    try:
        return os.open(component, flags, dir_fd=parent_fd)
    except OSError as exc:
        if exc.errno == errno.ELOOP:
            raise _UnsafeOutputPathError(
                f"Refusing render inspection output symlink: {relative_path}"
            ) from exc
        raise


def _sha256_regular_file_descriptor(file_fd: int, relative_path: str) -> str:
    file_stat = os.fstat(file_fd)
    if not stat.S_ISREG(file_stat.st_mode):
        raise IsADirectoryError(
            f"Declared succeeded output is not a regular file: {relative_path}"
        )
    digest = hashlib.sha256()
    while True:
        chunk = os.read(file_fd, 1024 * 1024)
        if not chunk:
            break
        digest.update(chunk)
    return digest.hexdigest()


def _component_is_symlink(parent_fd: int, component: str) -> bool:
    try:
        component_stat = os.stat(component, dir_fd=parent_fd, follow_symlinks=False)
    except OSError:
        return False
    return stat.S_ISLNK(component_stat.st_mode)


def _status_counts(status_manifest: RenderStatusManifest) -> dict[str, int]:
    counts = {state: 0 for state in _RENDER_STATES}
    for status_entry in status_manifest.task_statuses:
        counts[status_entry.state] += 1
    return counts


def _task_ids_with_state(
    status_manifest: RenderStatusManifest,
    state: str,
) -> tuple[str, ...]:
    return tuple(
        status_entry.task_id
        for status_entry in status_manifest.task_statuses
        if status_entry.state == state
    )


def _review_required_task_ids(
    trusted_plan: AssemblyPlan,
    *,
    status_manifest: RenderStatusManifest,
    outputs: tuple[RenderOutputInspection, ...],
) -> tuple[str, ...]:
    review_required = {
        status_entry.task_id
        for status_entry in status_manifest.task_statuses
        if status_entry.state in _REVIEW_REQUIRED_STATES
    }
    review_required.update(
        output.task_id for output in outputs if output.state != "verified"
    )
    return tuple(
        task.task_id
        for task in trusted_plan.render_tasks
        if task.task_id in review_required
    )


def _validate_report(report: RenderWorkspaceInspectionReport) -> None:
    if not isinstance(report, RenderWorkspaceInspectionReport):
        raise RenderInspectionError("inspection report must be a RenderWorkspaceInspectionReport")
    if report.schema_version != _INSPECTION_SCHEMA_VERSION:
        raise RenderInspectionError("unsupported render inspection schema version")
    if not isinstance(report.shoot_slug, str) or not report.shoot_slug.strip():
        raise RenderInspectionError("inspection report shoot_slug cannot be empty")
    if not isinstance(report.render_plan_fingerprint, str) or not report.render_plan_fingerprint.strip():
        raise RenderInspectionError("inspection report render_plan_fingerprint cannot be empty")
    if not isinstance(report.total_task_count, int) or report.total_task_count < 0:
        raise RenderInspectionError("inspection report total_task_count must be non-negative")
    if set(report.status_counts) != set(_RENDER_STATES):
        raise RenderInspectionError("inspection report status_counts are invalid")
    for count in report.status_counts.values():
        if not isinstance(count, int) or count < 0:
            raise RenderInspectionError("inspection report status count must be non-negative")
    for field_name in (
        "pending_task_ids",
        "running_task_ids",
        "succeeded_task_ids",
        "failed_task_ids",
        "retryable_task_ids",
        "outputs",
        "review_required_task_ids",
        "notes",
    ):
        value = getattr(report, field_name)
        if not isinstance(value, tuple):
            raise RenderInspectionError(f"inspection report {field_name} must be a tuple")
    for output in report.outputs:
        _validate_output_inspection(output)
    if report.verified_output_count != sum(1 for output in report.outputs if output.state == "verified"):
        raise RenderInspectionError("inspection report verified_output_count is inconsistent")


def _validate_output_inspection(output: RenderOutputInspection) -> None:
    if not isinstance(output, RenderOutputInspection):
        raise RenderInspectionError("inspection output must be a RenderOutputInspection")
    if not isinstance(output.task_id, str) or not output.task_id.strip():
        raise RenderInspectionError("inspection output task_id cannot be empty")
    if not isinstance(output.path, str) or not output.path.strip():
        raise RenderInspectionError("inspection output path cannot be empty")
    if output.state not in _OUTPUT_STATES:
        raise RenderInspectionError(f"unsupported inspection output state: {output.state}")
    if not isinstance(output.expected_sha256, str) or not output.expected_sha256.strip():
        raise RenderInspectionError("inspection output expected_sha256 cannot be empty")
    if output.actual_sha256 is not None and (
        not isinstance(output.actual_sha256, str) or not output.actual_sha256.strip()
    ):
        raise RenderInspectionError("inspection output actual_sha256 must be non-empty when present")
    if output.message is not None and (
        not isinstance(output.message, str) or not output.message.strip()
    ):
        raise RenderInspectionError("inspection output message must be non-empty when present")


class _UnsafeOutputPathError(ValueError):
    pass
