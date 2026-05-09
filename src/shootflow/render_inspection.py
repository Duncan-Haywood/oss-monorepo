from __future__ import annotations

import errno
import hashlib
import os
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from shootflow.assembly import AssemblyPlan
from shootflow.render_status import load_render_status_manifest, validate_render_status_manifest

RenderOutputInspectionState = Literal[
    "verified",
    "missing",
    "checksum_mismatch",
    "unsafe_path",
    "not_a_file",
    "unreadable",
]
RenderWorkspaceInspectionStatus = Literal["complete", "attention_required", "in_progress"]

_INSPECTABLE_OUTPUT_STATES = frozenset(
    {"missing", "checksum_mismatch", "unsafe_path", "not_a_file", "unreadable"}
)
_TASK_STATES = ("pending", "running", "succeeded", "failed", "retryable")
_OUTPUT_STATES = (
    "verified",
    "missing",
    "checksum_mismatch",
    "unsafe_path",
    "not_a_file",
    "unreadable",
)


class RenderInspectionError(ValueError):
    """Raised when a render workspace cannot be inspected safely."""


class _UnsafeOutputPathError(OSError):
    """Raised when an output path resolves through a symlink or non-file."""


@dataclass(frozen=True)
class RenderOutputInspection:
    task_id: str
    path: str
    expected_sha256: str
    observed_sha256: str | None
    state: RenderOutputInspectionState


@dataclass(frozen=True)
class RenderWorkspaceInspectionReport:
    shoot_slug: str
    render_plan_fingerprint: str
    status: RenderWorkspaceInspectionStatus
    task_counts: dict[str, int]
    output_counts: dict[str, int]
    review_required_task_ids: tuple[str, ...]
    outputs: tuple[RenderOutputInspection, ...]
    notes: tuple[str, ...]


def inspect_render_workspace(
    workspace_root: Path | str,
    *,
    trusted_plan: AssemblyPlan,
) -> RenderWorkspaceInspectionReport:
    """Inspect declared render outputs without changing workspace state."""

    _validate_inputs(workspace_root, trusted_plan=trusted_plan)
    root = Path(workspace_root)
    status_manifest = load_render_status_manifest(root, trusted_plan=trusted_plan)
    validate_render_status_manifest(status_manifest, trusted_plan=trusted_plan)

    outputs: list[RenderOutputInspection] = []
    for status in status_manifest.task_statuses:
        if status.state != "succeeded":
            continue
        for checksum in status.output_checksums:
            outputs.append(
                _inspect_output(
                    root,
                    task_id=status.task_id,
                    path=checksum.path,
                    expected_sha256=checksum.sha256,
                )
            )

    review_required_task_ids = _review_required_task_ids(status_manifest.task_statuses, tuple(outputs))
    task_counts = _task_counts(status_manifest.task_statuses)
    output_counts = _output_counts(tuple(outputs))
    report = RenderWorkspaceInspectionReport(
        shoot_slug=status_manifest.shoot_slug,
        render_plan_fingerprint=status_manifest.render_plan_fingerprint,
        status=_workspace_status(
            task_counts=task_counts,
            output_counts=output_counts,
            review_required_task_ids=review_required_task_ids,
        ),
        task_counts=task_counts,
        output_counts=output_counts,
        review_required_task_ids=review_required_task_ids,
        outputs=tuple(outputs),
        notes=(
            "read-only render inspection",
            "no render tasks were initialized, scheduled, retried, overwritten, or deleted",
            "only declared succeeded deliverable outputs were checksummed",
        ),
    )
    _validate_report(report)
    return report


def _validate_inputs(workspace_root: Path | str, *, trusted_plan: AssemblyPlan) -> None:
    if not isinstance(workspace_root, (Path, str)):
        raise RenderInspectionError("workspace_root must be a path")
    root = Path(workspace_root)
    if root.is_symlink():
        raise RenderInspectionError(f"Refusing render inspection workspace symlink: {root}")
    if not isinstance(trusted_plan, AssemblyPlan):
        raise RenderInspectionError("trusted_plan must be an AssemblyPlan")


def _inspect_output(
    root: Path,
    *,
    task_id: str,
    path: str,
    expected_sha256: str,
) -> RenderOutputInspection:
    output_path = root / path
    if output_path.is_symlink() or _has_symlink_parent(output_path, root):
        return RenderOutputInspection(
            task_id=task_id,
            path=path,
            expected_sha256=expected_sha256,
            observed_sha256=None,
            state="unsafe_path",
        )
    if not output_path.exists():
        return RenderOutputInspection(
            task_id=task_id,
            path=path,
            expected_sha256=expected_sha256,
            observed_sha256=None,
            state="missing",
        )
    if not output_path.is_file():
        return RenderOutputInspection(
            task_id=task_id,
            path=path,
            expected_sha256=expected_sha256,
            observed_sha256=None,
            state="not_a_file",
        )
    try:
        observed_sha256 = _sha256_file(output_path)
    except _UnsafeOutputPathError:
        return RenderOutputInspection(
            task_id=task_id,
            path=path,
            expected_sha256=expected_sha256,
            observed_sha256=None,
            state="unsafe_path",
        )
    except OSError:
        return RenderOutputInspection(
            task_id=task_id,
            path=path,
            expected_sha256=expected_sha256,
            observed_sha256=None,
            state="unreadable",
        )
    return RenderOutputInspection(
        task_id=task_id,
        path=path,
        expected_sha256=expected_sha256,
        observed_sha256=observed_sha256,
        state="verified" if observed_sha256 == expected_sha256 else "checksum_mismatch",
    )


def _has_symlink_parent(path: Path, root: Path) -> bool:
    current = path.parent
    while current != root and current != current.parent:
        if current.is_symlink():
            return True
        current = current.parent
    return False


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        if exc.errno == errno.ELOOP:
            raise _UnsafeOutputPathError(str(path)) from exc
        raise
    try:
        file_stat = os.fstat(fd)
        if not stat.S_ISREG(file_stat.st_mode):
            raise _UnsafeOutputPathError(str(path))
        with os.fdopen(fd, "rb") as output_file:
            fd = -1
            for chunk in iter(lambda: output_file.read(1024 * 1024), b""):
                digest.update(chunk)
    finally:
        if fd >= 0:
            os.close(fd)
    return digest.hexdigest()


def _task_counts(statuses: object) -> dict[str, int]:
    counts = {state: 0 for state in _TASK_STATES}
    for status in statuses:
        counts[status.state] += 1
    return counts


def _output_counts(outputs: tuple[RenderOutputInspection, ...]) -> dict[str, int]:
    counts = {state: 0 for state in _OUTPUT_STATES}
    for output in outputs:
        counts[output.state] += 1
    return counts


def _review_required_task_ids(statuses: object, outputs: tuple[RenderOutputInspection, ...]) -> tuple[str, ...]:
    review_ids: list[str] = []
    seen_ids: set[str] = set()
    for status in statuses:
        if status.state in {"failed", "retryable"}:
            review_ids.append(status.task_id)
            seen_ids.add(status.task_id)
    for output in outputs:
        if output.state in _INSPECTABLE_OUTPUT_STATES and output.task_id not in seen_ids:
            review_ids.append(output.task_id)
            seen_ids.add(output.task_id)
    return tuple(review_ids)


def _workspace_status(
    *,
    task_counts: dict[str, int],
    output_counts: dict[str, int],
    review_required_task_ids: tuple[str, ...],
) -> RenderWorkspaceInspectionStatus:
    if review_required_task_ids or any(output_counts[state] for state in _INSPECTABLE_OUTPUT_STATES):
        return "attention_required"
    if task_counts["pending"] or task_counts["running"] or task_counts["retryable"]:
        return "in_progress"
    return "complete"


def _validate_report(report: RenderWorkspaceInspectionReport) -> None:
    if not isinstance(report, RenderWorkspaceInspectionReport):
        raise RenderInspectionError("report must be a RenderWorkspaceInspectionReport")
    if not isinstance(report.shoot_slug, str) or not report.shoot_slug.strip():
        raise RenderInspectionError("report shoot_slug cannot be empty")
    if not isinstance(report.render_plan_fingerprint, str) or not report.render_plan_fingerprint.strip():
        raise RenderInspectionError("report render_plan_fingerprint cannot be empty")
    if report.status not in {"complete", "attention_required", "in_progress"}:
        raise RenderInspectionError("report status is invalid")
    for counts_name in ("task_counts", "output_counts"):
        counts = getattr(report, counts_name)
        if not isinstance(counts, dict):
            raise RenderInspectionError(f"report {counts_name} must be a dict")
        for key, value in counts.items():
            if not isinstance(key, str) or isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise RenderInspectionError(f"report {counts_name} contains invalid counts")
    for task_id in report.review_required_task_ids:
        if not isinstance(task_id, str) or not task_id.strip():
            raise RenderInspectionError("report review_required_task_ids contains invalid task ids")
    if not isinstance(report.outputs, tuple):
        raise RenderInspectionError("report outputs must be a tuple")
    for output in report.outputs:
        _validate_output(output)
    if not isinstance(report.notes, tuple):
        raise RenderInspectionError("report notes must be a tuple")
    for note in report.notes:
        if not isinstance(note, str) or not note.strip():
            raise RenderInspectionError("report notes contains invalid notes")


def _validate_output(output: RenderOutputInspection) -> None:
    if not isinstance(output, RenderOutputInspection):
        raise RenderInspectionError("report outputs must contain RenderOutputInspection entries")
    for field_name in ("task_id", "path", "expected_sha256"):
        value = getattr(output, field_name)
        if not isinstance(value, str) or not value.strip():
            raise RenderInspectionError(f"report output {field_name} cannot be empty")
    if output.observed_sha256 is not None and not isinstance(output.observed_sha256, str):
        raise RenderInspectionError("report output observed_sha256 must be null or a string")
    if output.state not in _OUTPUT_STATES:
        raise RenderInspectionError("report output state is invalid")
