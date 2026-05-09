from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

_PILOT_COHORT_REPORT_SCHEMA_VERSION = 1
_PILOT_DASHBOARD_SCHEMA_VERSION = 2
_BASIS_POINTS = 10_000


class PilotCohortReportError(ValueError):
    """Raised when pilot dashboard payloads cannot be aggregated safely."""


@dataclass(frozen=True)
class PilotCohortWorkspaceEvidence:
    dashboard_path: Path
    workspace: str
    shoot_slug: str | None
    metrics_available: bool
    ready_for_pilot_review: bool
    completion_rate_basis_points: int | None
    intervention_rate_basis_points: int | None
    materialized_output_count: int | None
    threshold_notes: tuple[str, ...]


@dataclass(frozen=True)
class PilotCohortMetrics:
    dashboard_count: int
    metrics_available_dashboard_count: int
    metrics_unavailable_dashboard_count: int
    pilot_ready_workspace_count: int
    pilot_ready_workspace_rate_basis_points: int | None
    median_intervention_rate_basis_points: int | None
    first_draft_output_count: int
    ready_for_pilot_review: bool
    cohort_notes: tuple[str, ...]


@dataclass(frozen=True)
class PilotCohortReport:
    generated_at: str
    cohort: PilotCohortMetrics
    workspaces: tuple[PilotCohortWorkspaceEvidence, ...]
    safety_notes: tuple[str, ...]


def build_pilot_cohort_report_from_paths(
    dashboard_json_paths: Sequence[Path | str],
    *,
    generated_at: str,
) -> PilotCohortReport:
    """Aggregate saved pilot-dashboard JSON payloads without reading workspace internals."""

    _validate_timestamp(generated_at)
    paths = _validate_dashboard_paths(dashboard_json_paths)
    workspaces = tuple(_workspace_evidence_from_dashboard_path(path) for path in paths)
    report = PilotCohortReport(
        generated_at=generated_at,
        cohort=_build_cohort_metrics(workspaces),
        workspaces=workspaces,
        safety_notes=(
            "pilot-cohort-report is read-only and consumes saved pilot dashboard JSON payloads",
            "pilot-cohort-report does not authorize workflow actions",
            "cohort reports do not grant copy, retry, cleanup, overwrite, materialization, or deletion authority",
            "cohort reports never read raw worker internals or workspace manifests",
        ),
    )
    _validate_cohort_report(report)
    return report


def pilot_cohort_report_to_dict(report: PilotCohortReport) -> dict[str, object]:
    if not isinstance(report, PilotCohortReport):
        raise PilotCohortReportError("report must be a PilotCohortReport")
    _validate_cohort_report(report)
    return {
        "schema_version": _PILOT_COHORT_REPORT_SCHEMA_VERSION,
        "generated_at": report.generated_at,
        "cohort": {
            "dashboard_count": report.cohort.dashboard_count,
            "metrics_available_dashboard_count": report.cohort.metrics_available_dashboard_count,
            "metrics_unavailable_dashboard_count": (
                report.cohort.metrics_unavailable_dashboard_count
            ),
            "pilot_ready_workspace_count": report.cohort.pilot_ready_workspace_count,
            "pilot_ready_workspace_rate_basis_points": (
                report.cohort.pilot_ready_workspace_rate_basis_points
            ),
            "median_intervention_rate_basis_points": (
                report.cohort.median_intervention_rate_basis_points
            ),
            "first_draft_output_count": report.cohort.first_draft_output_count,
            "ready_for_pilot_review": report.cohort.ready_for_pilot_review,
            "cohort_notes": list(report.cohort.cohort_notes),
        },
        "workspaces": [
            {
                "dashboard_path": str(workspace.dashboard_path),
                "workspace": workspace.workspace,
                "shoot_slug": workspace.shoot_slug,
                "metrics_available": workspace.metrics_available,
                "ready_for_pilot_review": workspace.ready_for_pilot_review,
                "completion_rate_basis_points": workspace.completion_rate_basis_points,
                "intervention_rate_basis_points": workspace.intervention_rate_basis_points,
                "materialized_output_count": workspace.materialized_output_count,
                "threshold_notes": list(workspace.threshold_notes),
            }
            for workspace in report.workspaces
        ],
        "safety_notes": list(report.safety_notes),
    }


def _build_cohort_metrics(
    workspaces: tuple[PilotCohortWorkspaceEvidence, ...],
) -> PilotCohortMetrics:
    dashboard_count = len(workspaces)
    available = tuple(workspace for workspace in workspaces if workspace.metrics_available)
    unavailable_count = dashboard_count - len(available)
    ready_count = sum(1 for workspace in available if workspace.ready_for_pilot_review)
    ready_rate = None
    if available:
        ready_rate = (ready_count * _BASIS_POINTS) // len(available)
    intervention_rates = tuple(
        workspace.intervention_rate_basis_points
        for workspace in available
        if workspace.intervention_rate_basis_points is not None
    )
    output_count = sum(
        workspace.materialized_output_count or 0
        for workspace in available
    )
    cohort_ready = bool(available) and unavailable_count == 0 and ready_count == len(available)
    notes = _cohort_notes(
        metrics_available_count=len(available),
        metrics_unavailable_count=unavailable_count,
        ready_count=ready_count,
        dashboard_count=dashboard_count,
        cohort_ready=cohort_ready,
    )
    return PilotCohortMetrics(
        dashboard_count=dashboard_count,
        metrics_available_dashboard_count=len(available),
        metrics_unavailable_dashboard_count=unavailable_count,
        pilot_ready_workspace_count=ready_count,
        pilot_ready_workspace_rate_basis_points=ready_rate,
        median_intervention_rate_basis_points=_median_basis_points(intervention_rates),
        first_draft_output_count=output_count,
        ready_for_pilot_review=cohort_ready,
        cohort_notes=notes,
    )


def _cohort_notes(
    *,
    metrics_available_count: int,
    metrics_unavailable_count: int,
    ready_count: int,
    dashboard_count: int,
    cohort_ready: bool,
) -> tuple[str, ...]:
    if metrics_available_count == 0:
        return ("trusted dashboard metrics are required before cohort readiness can be evaluated",)
    notes: list[str] = []
    if metrics_unavailable_count:
        notes.append("some dashboards lack trusted metrics and are excluded from rate calculations")
    if ready_count < metrics_available_count:
        notes.append("not every metrics-available workspace meets pilot acceptance thresholds")
    if cohort_ready:
        notes.append("all cohort dashboards meet pilot acceptance thresholds")
    if dashboard_count == 0:
        notes.append("at least one dashboard JSON payload is required")
    return tuple(notes)


def _median_basis_points(values: tuple[int, ...]) -> int | None:
    if not values:
        return None
    sorted_values = sorted(values)
    middle = len(sorted_values) // 2
    if len(sorted_values) % 2:
        return sorted_values[middle]
    return (sorted_values[middle - 1] + sorted_values[middle]) // 2


def _workspace_evidence_from_dashboard_path(path: Path) -> PilotCohortWorkspaceEvidence:
    payload = _load_dashboard_payload(path)
    acceptance = _required_mapping(payload, "pilot_acceptance", path)
    workspace = _required_string(payload, "workspace", path)
    shoot_slug = payload.get("shoot_slug")
    if shoot_slug is not None and not isinstance(shoot_slug, str):
        raise PilotCohortReportError(f"dashboard shoot_slug must be a string or null: {path}")
    declared_metrics_available = _required_bool(acceptance, "metrics_available", path)
    declared_ready = _required_bool(acceptance, "ready_for_pilot_review", path)
    completion_rate = _optional_basis_points(
        acceptance,
        "completion_rate_basis_points",
        path,
    )
    intervention_rate = _optional_basis_points(
        acceptance,
        "intervention_rate_basis_points",
        path,
    )
    output_count = _optional_non_negative_int(
        acceptance,
        "materialized_output_count",
        path,
    )
    threshold_notes = _required_string_tuple(acceptance, "threshold_notes", path)
    metrics_available = declared_metrics_available and all(
        value is not None
        for value in (
            completion_rate,
            intervention_rate,
            output_count,
        )
    )
    if declared_metrics_available and not metrics_available:
        threshold_notes = threshold_notes + (
            "dashboard acceptance metrics were incomplete and excluded from cohort rates",
        )
    return PilotCohortWorkspaceEvidence(
        dashboard_path=path,
        workspace=workspace,
        shoot_slug=shoot_slug,
        metrics_available=metrics_available,
        ready_for_pilot_review=declared_ready and metrics_available,
        completion_rate_basis_points=completion_rate,
        intervention_rate_basis_points=intervention_rate,
        materialized_output_count=output_count,
        threshold_notes=threshold_notes,
    )


def _load_dashboard_payload(path: Path) -> Mapping[str, object]:
    if path.is_symlink():
        raise PilotCohortReportError(f"Refusing pilot dashboard symlink: {path}")
    if not path.is_file():
        raise FileNotFoundError(path)
    try:
        raw_text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise PilotCohortReportError(f"Unable to read pilot dashboard JSON: {path}") from exc
    try:
        raw_payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise PilotCohortReportError(f"Invalid pilot dashboard JSON: {path}") from exc
    if not isinstance(raw_payload, Mapping):
        raise PilotCohortReportError(f"pilot dashboard JSON must be an object: {path}")
    schema_version = raw_payload.get("schema_version")
    if schema_version != _PILOT_DASHBOARD_SCHEMA_VERSION:
        raise PilotCohortReportError(
            f"pilot dashboard schema_version must be {_PILOT_DASHBOARD_SCHEMA_VERSION}: {path}"
        )
    return raw_payload


def _validate_dashboard_paths(dashboard_json_paths: Sequence[Path | str]) -> tuple[Path, ...]:
    if isinstance(dashboard_json_paths, (str, bytes)) or not isinstance(
        dashboard_json_paths,
        Sequence,
    ):
        raise PilotCohortReportError("dashboard_json_paths must be a non-empty sequence")
    paths = tuple(Path(path) for path in dashboard_json_paths)
    if not paths:
        raise PilotCohortReportError("at least one dashboard JSON path is required")
    return paths


def _required_mapping(payload: Mapping[str, object], field_name: str, path: Path) -> Mapping[str, object]:
    value = payload.get(field_name)
    if not isinstance(value, Mapping):
        raise PilotCohortReportError(f"dashboard {field_name} must be an object: {path}")
    return value


def _required_string(payload: Mapping[str, object], field_name: str, path: Path) -> str:
    value = payload.get(field_name)
    if not isinstance(value, str) or not value.strip():
        raise PilotCohortReportError(f"dashboard {field_name} must be a non-empty string: {path}")
    return value


def _required_bool(payload: Mapping[str, object], field_name: str, path: Path) -> bool:
    value = payload.get(field_name)
    if not isinstance(value, bool):
        raise PilotCohortReportError(f"dashboard {field_name} must be a boolean: {path}")
    return value


def _optional_basis_points(
    payload: Mapping[str, object],
    field_name: str,
    path: Path,
) -> int | None:
    value = _optional_non_negative_int(payload, field_name, path)
    if value is not None and value > _BASIS_POINTS:
        raise PilotCohortReportError(f"dashboard {field_name} cannot exceed 10000: {path}")
    return value


def _optional_non_negative_int(
    payload: Mapping[str, object],
    field_name: str,
    path: Path,
) -> int | None:
    value = payload.get(field_name)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise PilotCohortReportError(
            f"dashboard {field_name} must be a non-negative integer or null: {path}"
        )
    return value


def _required_string_tuple(
    payload: Mapping[str, object],
    field_name: str,
    path: Path,
) -> tuple[str, ...]:
    value = payload.get(field_name)
    if not isinstance(value, list):
        raise PilotCohortReportError(f"dashboard {field_name} must be a list: {path}")
    notes: list[str] = []
    for note in value:
        if not isinstance(note, str) or not note.strip():
            raise PilotCohortReportError(
                f"dashboard {field_name} must contain non-empty strings: {path}"
            )
        notes.append(note)
    return tuple(notes)


def _validate_cohort_report(report: PilotCohortReport) -> None:
    if not isinstance(report, PilotCohortReport):
        raise PilotCohortReportError("report must be a PilotCohortReport")
    _validate_timestamp(report.generated_at)
    if not isinstance(report.workspaces, tuple) or not report.workspaces:
        raise PilotCohortReportError("report workspaces must be a non-empty tuple")
    for workspace in report.workspaces:
        _validate_workspace_evidence(workspace)
    _validate_cohort_metrics(report.cohort, workspace_count=len(report.workspaces))
    if not isinstance(report.safety_notes, tuple):
        raise PilotCohortReportError("report safety_notes must be a tuple")
    for note in report.safety_notes:
        if not isinstance(note, str) or not note.strip():
            raise PilotCohortReportError("report safety_notes must contain non-empty strings")


def _validate_workspace_evidence(workspace: PilotCohortWorkspaceEvidence) -> None:
    if not isinstance(workspace, PilotCohortWorkspaceEvidence):
        raise PilotCohortReportError("workspace evidence must be PilotCohortWorkspaceEvidence")
    if not isinstance(workspace.dashboard_path, Path):
        raise PilotCohortReportError("workspace dashboard_path must be a Path")
    if not isinstance(workspace.workspace, str) or not workspace.workspace.strip():
        raise PilotCohortReportError("workspace path must be a non-empty string")
    if workspace.shoot_slug is not None and not isinstance(workspace.shoot_slug, str):
        raise PilotCohortReportError("workspace shoot_slug must be a string or None")
    if not isinstance(workspace.metrics_available, bool):
        raise PilotCohortReportError("workspace metrics_available must be a boolean")
    if not isinstance(workspace.ready_for_pilot_review, bool):
        raise PilotCohortReportError("workspace ready_for_pilot_review must be a boolean")
    for field_name in (
        "completion_rate_basis_points",
        "intervention_rate_basis_points",
        "materialized_output_count",
    ):
        value = getattr(workspace, field_name)
        if value is None:
            continue
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise PilotCohortReportError(f"workspace {field_name} is invalid")
        if field_name.endswith("_basis_points") and value > _BASIS_POINTS:
            raise PilotCohortReportError(f"workspace {field_name} cannot exceed 10000")
    if not isinstance(workspace.threshold_notes, tuple):
        raise PilotCohortReportError("workspace threshold_notes must be a tuple")
    for note in workspace.threshold_notes:
        if not isinstance(note, str) or not note.strip():
            raise PilotCohortReportError("workspace threshold_notes must contain non-empty strings")


def _validate_cohort_metrics(metrics: PilotCohortMetrics, *, workspace_count: int) -> None:
    if not isinstance(metrics, PilotCohortMetrics):
        raise PilotCohortReportError("cohort must be PilotCohortMetrics")
    for field_name in (
        "dashboard_count",
        "metrics_available_dashboard_count",
        "metrics_unavailable_dashboard_count",
        "pilot_ready_workspace_count",
        "first_draft_output_count",
    ):
        value = getattr(metrics, field_name)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise PilotCohortReportError(f"cohort {field_name} must be a non-negative integer")
    if metrics.dashboard_count != workspace_count:
        raise PilotCohortReportError("cohort dashboard_count must match workspace count")
    if (
        metrics.metrics_available_dashboard_count
        + metrics.metrics_unavailable_dashboard_count
        != metrics.dashboard_count
    ):
        raise PilotCohortReportError("cohort available and unavailable counts must match dashboard count")
    for field_name in (
        "pilot_ready_workspace_rate_basis_points",
        "median_intervention_rate_basis_points",
    ):
        value = getattr(metrics, field_name)
        if value is None:
            continue
        if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > _BASIS_POINTS:
            raise PilotCohortReportError(f"cohort {field_name} must be basis points or None")
    if not isinstance(metrics.ready_for_pilot_review, bool):
        raise PilotCohortReportError("cohort ready_for_pilot_review must be a boolean")
    if not isinstance(metrics.cohort_notes, tuple) or not metrics.cohort_notes:
        raise PilotCohortReportError("cohort notes must be a non-empty tuple")
    for note in metrics.cohort_notes:
        if not isinstance(note, str) or not note.strip():
            raise PilotCohortReportError("cohort notes must contain non-empty strings")


def _validate_timestamp(timestamp: str) -> None:
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise PilotCohortReportError("generated_at must be a non-empty string")
    if len(timestamp) > 80 or "\x00" in timestamp or "\n" in timestamp or "\r" in timestamp:
        raise PilotCohortReportError("generated_at is invalid")
