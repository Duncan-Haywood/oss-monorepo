from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from shootflow.pilot_authority import (
    PilotAuthorityError,
    observe_only_workflow_authority_to_dict,
    validate_observe_only_workflow_authority,
)

_PILOT_COHORT_BRIEF_SCHEMA_VERSION = 1
_PILOT_COHORT_REPORT_SCHEMA_VERSION = 1
_BASIS_POINTS = 10_000
_DEFAULT_MIN_COMPLETION_RATE_BASIS_POINTS = 9_000
_DEFAULT_MAX_INTERVENTION_RATE_BASIS_POINTS = 2_000
_DEFAULT_MIN_MATERIALIZED_OUTPUT_COUNT = 1
_READINESS_BLOCKER_FIELDS = (
    "metrics_unavailable",
    "completion_below_threshold",
    "intervention_above_threshold",
    "materialized_outputs_missing",
)
_READINESS_BLOCKER_LABELS = {
    "metrics_unavailable": "Metrics unavailable",
    "completion_below_threshold": "Completion below threshold",
    "intervention_above_threshold": "Manual intervention above threshold",
    "materialized_outputs_missing": "Materialized outputs missing",
}


class PilotCohortBriefError(ValueError):
    """Raised when a saved cohort report cannot be presented safely."""


@dataclass(frozen=True)
class PilotCohortWorkspaceBriefCard:
    title: str
    workspace: str
    dashboard_path: str
    readiness_label: str
    completion_rate_label: str
    intervention_rate_label: str
    materialized_output_count: int | None
    threshold_notes: tuple[str, ...]
    readiness_blockers: tuple[str, ...]
    readiness_blocker_labels: tuple[str, ...]


@dataclass(frozen=True)
class PilotCohortBriefReadinessBlockers:
    metrics_unavailable: int
    completion_below_threshold: int
    intervention_above_threshold: int
    materialized_outputs_missing: int


@dataclass(frozen=True)
class _WorkspaceConsistencyMetrics:
    metrics_available_count: int
    metrics_unavailable_count: int
    ready_count: int
    output_count: int
    intervention_rates: tuple[int, ...]
    readiness_blockers: PilotCohortBriefReadinessBlockers


@dataclass(frozen=True)
class PilotCohortBriefSummary:
    dashboard_count: int
    metrics_available_dashboard_count: int
    metrics_unavailable_dashboard_count: int
    pilot_ready_workspace_count: int
    pilot_ready_workspace_rate_label: str
    median_intervention_rate_label: str
    first_draft_output_count: int
    ready_for_pilot_review: bool
    readiness_blockers: PilotCohortBriefReadinessBlockers


@dataclass(frozen=True)
class PilotCohortBrief:
    cohort_report_path: Path
    source_generated_at: str
    status: str
    headline: str
    summary: PilotCohortBriefSummary
    workspace_cards: tuple[PilotCohortWorkspaceBriefCard, ...]
    cohort_notes: tuple[str, ...]
    safety_notes: tuple[str, ...]


def build_pilot_cohort_brief_from_report_path(cohort_report_path: Path | str) -> PilotCohortBrief:
    """Build an observe-only UI summary from a saved pilot-cohort-report JSON file."""

    path = _validate_report_path(cohort_report_path)
    payload = _load_report_payload(path)
    cohort = _required_mapping(payload, "cohort", path)
    workspaces = _required_sequence(payload, "workspaces", path)
    source_generated_at = _required_timestamp(payload, "generated_at", path)
    summary = _brief_summary_from_cohort(cohort, workspaces=workspaces, path=path)
    _validate_saved_report_consistency(
        cohort=cohort,
        workspaces=workspaces,
        summary=summary,
        path=path,
    )
    workspace_cards = tuple(
        _workspace_card_from_payload(workspace, path=path) for workspace in workspaces
    )
    brief = PilotCohortBrief(
        cohort_report_path=path,
        source_generated_at=source_generated_at,
        status=_brief_status(summary),
        headline=_brief_headline(summary),
        summary=summary,
        workspace_cards=workspace_cards,
        cohort_notes=_required_string_tuple(cohort, "cohort_notes", path),
        safety_notes=(
            "pilot cohort brief is observe-only and reads one saved cohort report",
            "pilot cohort brief does not authorize workflow actions",
            "pilot cohort brief does not grant copy, retry, cleanup, overwrite, materialization, or deletion authority",
        ),
    )
    _validate_pilot_cohort_brief(brief)
    return brief


def pilot_cohort_brief_to_dict(brief: PilotCohortBrief) -> dict[str, object]:
    if not isinstance(brief, PilotCohortBrief):
        raise PilotCohortBriefError("brief must be a PilotCohortBrief")
    _validate_pilot_cohort_brief(brief)
    return {
        "schema_version": _PILOT_COHORT_BRIEF_SCHEMA_VERSION,
        "cohort_report_path": str(brief.cohort_report_path),
        "source_generated_at": brief.source_generated_at,
        "status": brief.status,
        "headline": brief.headline,
        "workflow_authority": observe_only_workflow_authority_to_dict(),
        "summary": {
            "dashboard_count": brief.summary.dashboard_count,
            "metrics_available_dashboard_count": (
                brief.summary.metrics_available_dashboard_count
            ),
            "metrics_unavailable_dashboard_count": (
                brief.summary.metrics_unavailable_dashboard_count
            ),
            "pilot_ready_workspace_count": brief.summary.pilot_ready_workspace_count,
            "pilot_ready_workspace_rate_label": (
                brief.summary.pilot_ready_workspace_rate_label
            ),
            "median_intervention_rate_label": (
                brief.summary.median_intervention_rate_label
            ),
            "first_draft_output_count": brief.summary.first_draft_output_count,
            "ready_for_pilot_review": brief.summary.ready_for_pilot_review,
            "readiness_blockers": _readiness_blockers_to_dict(
                brief.summary.readiness_blockers
            ),
        },
        "workspace_cards": [
            {
                "title": card.title,
                "workspace": card.workspace,
                "dashboard_path": card.dashboard_path,
                "readiness_label": card.readiness_label,
                "completion_rate_label": card.completion_rate_label,
                "intervention_rate_label": card.intervention_rate_label,
                "materialized_output_count": card.materialized_output_count,
                "threshold_notes": list(card.threshold_notes),
                "readiness_blockers": list(card.readiness_blockers),
                "readiness_blocker_labels": list(card.readiness_blocker_labels),
            }
            for card in brief.workspace_cards
        ],
        "cohort_notes": list(brief.cohort_notes),
        "safety_notes": list(brief.safety_notes),
    }


def pilot_cohort_brief_to_text(brief: PilotCohortBrief) -> str:
    """Render a command-free native-shell summary for pilot/GTM demos."""

    if not isinstance(brief, PilotCohortBrief):
        raise PilotCohortBriefError("brief must be a PilotCohortBrief")
    _validate_pilot_cohort_brief(brief)
    lines = [
        "ShootFlow pilot cohort brief",
        f"Status: {brief.status}",
        f"Headline: {brief.headline}",
        "Source report: omitted from text output",
        "Source generated at: omitted from text output",
        "",
        "Summary:",
        f"- Dashboards: {brief.summary.dashboard_count}",
        (
            "- Metrics: "
            f"{brief.summary.metrics_available_dashboard_count} available, "
            f"{brief.summary.metrics_unavailable_dashboard_count} unavailable"
        ),
        (
            "- Pilot-ready workspaces: "
            f"{brief.summary.pilot_ready_workspace_count} "
            f"({brief.summary.pilot_ready_workspace_rate_label})"
        ),
        f"- Median manual intervention: {brief.summary.median_intervention_rate_label}",
        f"- First-draft outputs: {brief.summary.first_draft_output_count}",
        (
            "- Readiness blockers: "
            f"{_readiness_blocker_counts_label(brief.summary.readiness_blockers)}"
        ),
        "",
        "Workspace cards:",
    ]
    for index, card in enumerate(brief.workspace_cards, start=1):
        lines.extend(
            [
                f"[{index}] Workspace {index}",
                f"  Readiness: {card.readiness_label}",
                f"  Completion: {card.completion_rate_label}",
                f"  Manual intervention: {card.intervention_rate_label}",
                f"  First-draft outputs: {_output_count_label(card.materialized_output_count)}",
                f"  Blockers: {_readiness_blocker_label_list(card.readiness_blocker_labels)}",
                "  Dashboard: omitted from text output",
                "  Threshold notes: omitted from text output",
            ]
        )
    lines.extend(
        [
            "",
            "Report notes: omitted from text output",
            "",
            "Safety:",
            "- observe-only presentation over one saved cohort report",
            "- does not authorize copy, retry, cleanup, overwrite, materialization, or other file-changing actions",
        ]
    )
    result = "\n".join(lines) + "\n"
    if not isinstance(result, str) or not result.strip():
        raise PilotCohortBriefError("brief text output must be a non-empty string")
    return result


def _load_report_payload(path: Path) -> Mapping[str, object]:
    if path.is_symlink():
        raise PilotCohortBriefError(f"Refusing pilot cohort report symlink: {path}")
    if not path.is_file():
        raise FileNotFoundError(path)
    try:
        raw_text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise PilotCohortBriefError(f"Unable to read pilot cohort report JSON: {path}") from exc
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise PilotCohortBriefError(f"Invalid pilot cohort report JSON: {path}") from exc
    if not isinstance(payload, Mapping):
        raise PilotCohortBriefError(f"pilot cohort report JSON must be an object: {path}")
    schema_version = payload.get("schema_version")
    if schema_version != _PILOT_COHORT_REPORT_SCHEMA_VERSION:
        raise PilotCohortBriefError(
            f"pilot cohort report schema_version must be {_PILOT_COHORT_REPORT_SCHEMA_VERSION}: {path}"
        )
    authority = payload.get("workflow_authority")
    if authority is not None:
        try:
            validate_observe_only_workflow_authority(
                authority,
                field_label="workflow_authority",
            )
        except PilotAuthorityError as exc:
            raise PilotCohortBriefError(str(exc)) from exc
    return payload


def _brief_summary_from_cohort(
    cohort: Mapping[str, object],
    *,
    workspaces: Sequence[object],
    path: Path,
) -> PilotCohortBriefSummary:
    readiness_blockers = _cohort_readiness_blockers_from_payloads(
        cohort,
        workspaces,
        path=path,
    )
    return PilotCohortBriefSummary(
        dashboard_count=_required_non_negative_int(cohort, "dashboard_count", path),
        metrics_available_dashboard_count=_required_non_negative_int(
            cohort,
            "metrics_available_dashboard_count",
            path,
        ),
        metrics_unavailable_dashboard_count=_required_non_negative_int(
            cohort,
            "metrics_unavailable_dashboard_count",
            path,
        ),
        pilot_ready_workspace_count=_required_non_negative_int(
            cohort,
            "pilot_ready_workspace_count",
            path,
        ),
        pilot_ready_workspace_rate_label=_basis_points_label(
            _optional_basis_points(cohort, "pilot_ready_workspace_rate_basis_points", path)
        ),
        median_intervention_rate_label=_basis_points_label(
            _optional_basis_points(cohort, "median_intervention_rate_basis_points", path)
        ),
        first_draft_output_count=_required_non_negative_int(
            cohort,
            "first_draft_output_count",
            path,
        ),
        ready_for_pilot_review=_required_bool(cohort, "ready_for_pilot_review", path),
        readiness_blockers=readiness_blockers,
    )


def _validate_saved_report_consistency(
    *,
    cohort: Mapping[str, object],
    workspaces: Sequence[object],
    summary: PilotCohortBriefSummary,
    path: Path,
) -> None:
    if summary.dashboard_count != len(workspaces):
        raise PilotCohortBriefError("cohort dashboard_count must match workspace count")
    if (
        summary.metrics_available_dashboard_count
        + summary.metrics_unavailable_dashboard_count
        != summary.dashboard_count
    ):
        raise PilotCohortBriefError("cohort available and unavailable counts must match dashboard count")
    if summary.pilot_ready_workspace_count > summary.metrics_available_dashboard_count:
        raise PilotCohortBriefError("cohort ready count cannot exceed metrics-available count")
    workspace_metrics = _workspace_consistency_metrics(workspaces, path=path)
    if workspace_metrics.metrics_available_count != summary.metrics_available_dashboard_count:
        raise PilotCohortBriefError("cohort metrics-available count disagrees with workspace evidence")
    if workspace_metrics.metrics_unavailable_count != summary.metrics_unavailable_dashboard_count:
        raise PilotCohortBriefError("cohort metrics-unavailable count disagrees with workspace evidence")
    if workspace_metrics.ready_count != summary.pilot_ready_workspace_count:
        raise PilotCohortBriefError("cohort ready count disagrees with workspace evidence")
    if workspace_metrics.output_count != summary.first_draft_output_count:
        raise PilotCohortBriefError("cohort output count disagrees with workspace evidence")
    if workspace_metrics.readiness_blockers != summary.readiness_blockers:
        raise PilotCohortBriefError("cohort readiness blocker counts disagree with workspace evidence")
    expected_ready_rate = _ready_rate_basis_points(
        ready_count=summary.pilot_ready_workspace_count,
        metrics_available_count=summary.metrics_available_dashboard_count,
    )
    declared_ready_rate = _optional_basis_points(
        cohort,
        "pilot_ready_workspace_rate_basis_points",
        path,
    )
    if declared_ready_rate != expected_ready_rate:
        raise PilotCohortBriefError("cohort ready rate disagrees with workspace evidence")
    expected_intervention_median = _median_basis_points(
        workspace_metrics.intervention_rates
    )
    declared_intervention_median = _optional_basis_points(
        cohort,
        "median_intervention_rate_basis_points",
        path,
    )
    if declared_intervention_median != expected_intervention_median:
        raise PilotCohortBriefError("cohort intervention median disagrees with workspace evidence")
    expected_cohort_ready = (
        summary.metrics_available_dashboard_count > 0
        and summary.metrics_unavailable_dashboard_count == 0
        and summary.pilot_ready_workspace_count == summary.metrics_available_dashboard_count
    )
    if summary.ready_for_pilot_review != expected_cohort_ready:
        raise PilotCohortBriefError("cohort ready_for_pilot_review disagrees with workspace evidence")


def _workspace_consistency_metrics(
    workspaces: Sequence[object],
    *,
    path: Path,
) -> _WorkspaceConsistencyMetrics:
    available_count = 0
    unavailable_count = 0
    ready_count = 0
    output_count = 0
    intervention_rates: list[int] = []
    readiness_blockers = PilotCohortBriefReadinessBlockers(0, 0, 0, 0)
    for workspace in workspaces:
        if not isinstance(workspace, Mapping):
            raise PilotCohortBriefError(f"cohort report workspace entries must be objects: {path}")
        metrics_available = _required_bool(workspace, "metrics_available", path)
        ready_for_pilot_review = _required_bool(workspace, "ready_for_pilot_review", path)
        completion_rate = _optional_basis_points(workspace, "completion_rate_basis_points", path)
        intervention_rate = _optional_basis_points(workspace, "intervention_rate_basis_points", path)
        materialized_output_count = _optional_non_negative_int(
            workspace,
            "materialized_output_count",
            path,
        )
        if metrics_available:
            if (
                completion_rate is None
                or intervention_rate is None
                or materialized_output_count is None
            ):
                raise PilotCohortBriefError("metrics-available workspace evidence must include all metrics")
            expected_ready = _workspace_meets_default_thresholds(
                completion_rate_basis_points=completion_rate,
                intervention_rate_basis_points=intervention_rate,
                materialized_output_count=materialized_output_count,
            )
            if ready_for_pilot_review != expected_ready:
                raise PilotCohortBriefError("workspace readiness disagrees with default pilot thresholds")
            available_count += 1
            intervention_rates.append(intervention_rate)
            output_count += materialized_output_count
            if ready_for_pilot_review:
                ready_count += 1
        else:
            if ready_for_pilot_review:
                raise PilotCohortBriefError("metrics-unavailable workspaces cannot be pilot-ready")
            unavailable_count += 1
        readiness_blockers = _add_workspace_readiness_blockers(
            readiness_blockers,
            _workspace_readiness_blockers(workspace, path=path),
        )
    return _WorkspaceConsistencyMetrics(
        metrics_available_count=available_count,
        metrics_unavailable_count=unavailable_count,
        ready_count=ready_count,
        output_count=output_count,
        intervention_rates=tuple(intervention_rates),
        readiness_blockers=readiness_blockers,
    )


def _ready_rate_basis_points(*, ready_count: int, metrics_available_count: int) -> int | None:
    if metrics_available_count == 0:
        return None
    return (ready_count * _BASIS_POINTS) // metrics_available_count


def _median_basis_points(values: tuple[int, ...]) -> int | None:
    if not values:
        return None
    sorted_values = sorted(values)
    middle = len(sorted_values) // 2
    if len(sorted_values) % 2:
        return sorted_values[middle]
    return (sorted_values[middle - 1] + sorted_values[middle]) // 2


def _workspace_meets_default_thresholds(
    *,
    completion_rate_basis_points: int,
    intervention_rate_basis_points: int,
    materialized_output_count: int,
) -> bool:
    return (
        completion_rate_basis_points >= _DEFAULT_MIN_COMPLETION_RATE_BASIS_POINTS
        and intervention_rate_basis_points <= _DEFAULT_MAX_INTERVENTION_RATE_BASIS_POINTS
        and materialized_output_count >= _DEFAULT_MIN_MATERIALIZED_OUTPUT_COUNT
    )


def _workspace_card_from_payload(
    payload: object,
    *,
    path: Path,
) -> PilotCohortWorkspaceBriefCard:
    if not isinstance(payload, Mapping):
        raise PilotCohortBriefError(f"cohort report workspace entries must be objects: {path}")
    workspace = _required_string(payload, "workspace", path)
    shoot_slug = payload.get("shoot_slug")
    if shoot_slug is not None and not isinstance(shoot_slug, str):
        raise PilotCohortBriefError(f"cohort report workspace shoot_slug must be a string or null: {path}")
    metrics_available = _required_bool(payload, "metrics_available", path)
    ready_for_pilot_review = _required_bool(payload, "ready_for_pilot_review", path)
    output_count = _optional_non_negative_int(payload, "materialized_output_count", path)
    readiness_blockers = _workspace_readiness_blockers(payload, path=path)
    return PilotCohortWorkspaceBriefCard(
        title=_workspace_card_title(shoot_slug=shoot_slug, workspace=workspace),
        workspace=workspace,
        dashboard_path=_required_string(payload, "dashboard_path", path),
        readiness_label=_readiness_label(
            metrics_available=metrics_available,
            ready_for_pilot_review=ready_for_pilot_review,
        ),
        completion_rate_label=_basis_points_label(
            _optional_basis_points(payload, "completion_rate_basis_points", path)
        ),
        intervention_rate_label=_basis_points_label(
            _optional_basis_points(payload, "intervention_rate_basis_points", path)
        ),
        materialized_output_count=output_count,
        threshold_notes=_required_string_tuple(payload, "threshold_notes", path),
        readiness_blockers=readiness_blockers,
        readiness_blocker_labels=_readiness_blocker_labels(readiness_blockers),
    )


def _brief_status(summary: PilotCohortBriefSummary) -> str:
    if summary.ready_for_pilot_review:
        return "ready_for_pilot_review"
    if summary.metrics_available_dashboard_count == 0:
        return "metrics_unavailable"
    if summary.metrics_unavailable_dashboard_count:
        return "needs_metric_review"
    return "needs_operator_review"


def _brief_headline(summary: PilotCohortBriefSummary) -> str:
    available = summary.metrics_available_dashboard_count
    ready = summary.pilot_ready_workspace_count
    if summary.ready_for_pilot_review:
        return f"All {available} metrics-available workspaces are pilot-ready"
    if available == 0:
        return "Trusted pilot metrics are unavailable"
    return f"{ready}/{available} metrics-available workspaces are pilot-ready"


def _workspace_card_title(*, shoot_slug: str | None, workspace: str) -> str:
    if isinstance(shoot_slug, str) and shoot_slug.strip():
        return shoot_slug
    workspace_name = Path(workspace).name
    return workspace_name if workspace_name else workspace


def _readiness_label(*, metrics_available: bool, ready_for_pilot_review: bool) -> str:
    if not metrics_available:
        return "Metrics unavailable"
    if ready_for_pilot_review:
        return "Ready for pilot review"
    return "Needs operator review"


def _basis_points_label(value: int | None) -> str:
    if value is None:
        return "unavailable"
    return f"{value / 100:.1f}%"


def _output_count_label(value: int | None) -> str:
    if value is None:
        return "unavailable"
    return str(value)


def _cohort_readiness_blockers_from_payloads(
    cohort: Mapping[str, object],
    workspaces: Sequence[object],
    *,
    path: Path,
) -> PilotCohortBriefReadinessBlockers:
    expected = PilotCohortBriefReadinessBlockers(0, 0, 0, 0)
    for workspace in workspaces:
        if not isinstance(workspace, Mapping):
            raise PilotCohortBriefError(f"cohort report workspace entries must be objects: {path}")
        expected = _add_workspace_readiness_blockers(
            expected,
            _workspace_readiness_blockers(workspace, path=path),
        )
    declared = cohort.get("readiness_blockers")
    if declared is None:
        return expected
    if not isinstance(declared, Mapping):
        raise PilotCohortBriefError(f"cohort report readiness_blockers must be an object: {path}")
    if set(declared.keys()) != set(_READINESS_BLOCKER_FIELDS):
        raise PilotCohortBriefError(f"cohort report readiness_blockers must use known blocker fields: {path}")
    parsed = PilotCohortBriefReadinessBlockers(
        metrics_unavailable=_required_non_negative_int(
            declared,
            "metrics_unavailable",
            path,
        ),
        completion_below_threshold=_required_non_negative_int(
            declared,
            "completion_below_threshold",
            path,
        ),
        intervention_above_threshold=_required_non_negative_int(
            declared,
            "intervention_above_threshold",
            path,
        ),
        materialized_outputs_missing=_required_non_negative_int(
            declared,
            "materialized_outputs_missing",
            path,
        ),
    )
    if parsed != expected:
        raise PilotCohortBriefError("cohort readiness blocker counts disagree with workspace evidence")
    return parsed


def _workspace_readiness_blockers(
    payload: Mapping[str, object],
    *,
    path: Path,
) -> tuple[str, ...]:
    metrics_available = _required_bool(payload, "metrics_available", path)
    ready_for_pilot_review = _required_bool(payload, "ready_for_pilot_review", path)
    completion_rate = _optional_basis_points(payload, "completion_rate_basis_points", path)
    intervention_rate = _optional_basis_points(payload, "intervention_rate_basis_points", path)
    materialized_output_count = _optional_non_negative_int(
        payload,
        "materialized_output_count",
        path,
    )
    derived = _derive_workspace_readiness_blockers(
        metrics_available=metrics_available,
        ready_for_pilot_review=ready_for_pilot_review,
        completion_rate_basis_points=completion_rate,
        intervention_rate_basis_points=intervention_rate,
        materialized_output_count=materialized_output_count,
    )
    declared = payload.get("readiness_blockers")
    if declared is None:
        return derived
    if not isinstance(declared, list):
        raise PilotCohortBriefError(f"cohort report readiness_blockers must be a list: {path}")
    blockers: list[str] = []
    for blocker in declared:
        if not isinstance(blocker, str) or blocker not in _READINESS_BLOCKER_LABELS:
            raise PilotCohortBriefError(
                f"cohort report readiness_blockers must contain known blocker codes: {path}"
            )
        if blocker in blockers:
            raise PilotCohortBriefError(
                f"cohort report readiness_blockers must not contain duplicate codes: {path}"
            )
        blockers.append(blocker)
    parsed = tuple(blockers)
    if parsed != derived:
        raise PilotCohortBriefError("workspace readiness blockers disagree with default pilot thresholds")
    return parsed


def _derive_workspace_readiness_blockers(
    *,
    metrics_available: bool,
    ready_for_pilot_review: bool,
    completion_rate_basis_points: int | None,
    intervention_rate_basis_points: int | None,
    materialized_output_count: int | None,
) -> tuple[str, ...]:
    if not metrics_available:
        return ("metrics_unavailable",)
    if (
        completion_rate_basis_points is None
        or intervention_rate_basis_points is None
        or materialized_output_count is None
    ):
        return ("metrics_unavailable",)
    blockers: list[str] = []
    if completion_rate_basis_points < _DEFAULT_MIN_COMPLETION_RATE_BASIS_POINTS:
        blockers.append("completion_below_threshold")
    if intervention_rate_basis_points > _DEFAULT_MAX_INTERVENTION_RATE_BASIS_POINTS:
        blockers.append("intervention_above_threshold")
    if materialized_output_count < _DEFAULT_MIN_MATERIALIZED_OUTPUT_COUNT:
        blockers.append("materialized_outputs_missing")
    if ready_for_pilot_review and blockers:
        raise PilotCohortBriefError("workspace readiness disagrees with default pilot thresholds")
    if not ready_for_pilot_review and not blockers:
        raise PilotCohortBriefError("workspace readiness disagrees with default pilot thresholds")
    return tuple(blockers)


def _add_workspace_readiness_blockers(
    counts: PilotCohortBriefReadinessBlockers,
    blockers: tuple[str, ...],
) -> PilotCohortBriefReadinessBlockers:
    return PilotCohortBriefReadinessBlockers(
        metrics_unavailable=counts.metrics_unavailable + int("metrics_unavailable" in blockers),
        completion_below_threshold=(
            counts.completion_below_threshold + int("completion_below_threshold" in blockers)
        ),
        intervention_above_threshold=(
            counts.intervention_above_threshold + int("intervention_above_threshold" in blockers)
        ),
        materialized_outputs_missing=(
            counts.materialized_outputs_missing + int("materialized_outputs_missing" in blockers)
        ),
    )


def _readiness_blockers_to_dict(
    blockers: PilotCohortBriefReadinessBlockers,
) -> dict[str, int]:
    return {
        "metrics_unavailable": blockers.metrics_unavailable,
        "completion_below_threshold": blockers.completion_below_threshold,
        "intervention_above_threshold": blockers.intervention_above_threshold,
        "materialized_outputs_missing": blockers.materialized_outputs_missing,
    }


def _readiness_blocker_labels(blockers: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(_READINESS_BLOCKER_LABELS[blocker] for blocker in blockers)


def _readiness_blocker_label_list(labels: tuple[str, ...]) -> str:
    if not labels:
        return "none"
    return "; ".join(labels)


def _readiness_blocker_counts_label(
    blockers: PilotCohortBriefReadinessBlockers,
) -> str:
    parts = [
        f"{_READINESS_BLOCKER_LABELS[field]}: {count}"
        for field, count in _readiness_blockers_to_dict(blockers).items()
        if count
    ]
    return "; ".join(parts) if parts else "none"


def _validate_report_path(cohort_report_path: Path | str) -> Path:
    if not isinstance(cohort_report_path, (Path, str)):
        raise PilotCohortBriefError("cohort_report_path must be a path")
    path = Path(cohort_report_path)
    if not str(path):
        raise PilotCohortBriefError("cohort_report_path must not be empty")
    return path


def _required_mapping(payload: Mapping[str, object], field_name: str, path: Path) -> Mapping[str, object]:
    value = payload.get(field_name)
    if not isinstance(value, Mapping):
        raise PilotCohortBriefError(f"cohort report {field_name} must be an object: {path}")
    return value


def _required_sequence(payload: Mapping[str, object], field_name: str, path: Path) -> Sequence[object]:
    value = payload.get(field_name)
    if not isinstance(value, list) or not value:
        raise PilotCohortBriefError(f"cohort report {field_name} must be a non-empty list: {path}")
    return value


def _required_string(payload: Mapping[str, object], field_name: str, path: Path) -> str:
    value = payload.get(field_name)
    if not isinstance(value, str) or not value.strip():
        raise PilotCohortBriefError(f"cohort report {field_name} must be a non-empty string: {path}")
    return value


def _required_timestamp(payload: Mapping[str, object], field_name: str, path: Path) -> str:
    value = _required_string(payload, field_name, path)
    if len(value) > 80 or "\x00" in value or "\n" in value or "\r" in value:
        raise PilotCohortBriefError(f"cohort report {field_name} is invalid: {path}")
    return value


def _required_bool(payload: Mapping[str, object], field_name: str, path: Path) -> bool:
    value = payload.get(field_name)
    if not isinstance(value, bool):
        raise PilotCohortBriefError(f"cohort report {field_name} must be a boolean: {path}")
    return value


def _required_non_negative_int(payload: Mapping[str, object], field_name: str, path: Path) -> int:
    value = payload.get(field_name)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise PilotCohortBriefError(f"cohort report {field_name} must be a non-negative integer: {path}")
    return value


def _optional_non_negative_int(payload: Mapping[str, object], field_name: str, path: Path) -> int | None:
    value = payload.get(field_name)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise PilotCohortBriefError(
            f"cohort report {field_name} must be a non-negative integer or null: {path}"
        )
    return value


def _optional_basis_points(payload: Mapping[str, object], field_name: str, path: Path) -> int | None:
    value = _optional_non_negative_int(payload, field_name, path)
    if value is not None and value > _BASIS_POINTS:
        raise PilotCohortBriefError(f"cohort report {field_name} cannot exceed 10000: {path}")
    return value


def _required_string_tuple(
    payload: Mapping[str, object],
    field_name: str,
    path: Path,
) -> tuple[str, ...]:
    value = payload.get(field_name)
    if not isinstance(value, list):
        raise PilotCohortBriefError(f"cohort report {field_name} must be a list: {path}")
    notes: list[str] = []
    for note in value:
        if not isinstance(note, str) or not note.strip():
            raise PilotCohortBriefError(
                f"cohort report {field_name} must contain non-empty strings: {path}"
            )
        notes.append(note)
    return tuple(notes)


def _validate_pilot_cohort_brief(brief: PilotCohortBrief) -> None:
    if not isinstance(brief, PilotCohortBrief):
        raise PilotCohortBriefError("brief must be a PilotCohortBrief")
    if not isinstance(brief.cohort_report_path, Path):
        raise PilotCohortBriefError("brief cohort_report_path must be a Path")
    for field_name in ("source_generated_at", "status", "headline"):
        value = getattr(brief, field_name)
        if not isinstance(value, str) or not value.strip():
            raise PilotCohortBriefError(f"brief {field_name} must be a non-empty string")
    if brief.status not in {
        "ready_for_pilot_review",
        "metrics_unavailable",
        "needs_metric_review",
        "needs_operator_review",
    }:
        raise PilotCohortBriefError("brief status is invalid")
    if not isinstance(brief.summary, PilotCohortBriefSummary):
        raise PilotCohortBriefError("brief summary must be a PilotCohortBriefSummary")
    _validate_brief_summary(brief.summary)
    if brief.status != _brief_status(brief.summary):
        raise PilotCohortBriefError("brief status disagrees with summary")
    if brief.headline != _brief_headline(brief.summary):
        raise PilotCohortBriefError("brief headline disagrees with summary")
    if not isinstance(brief.workspace_cards, tuple) or not brief.workspace_cards:
        raise PilotCohortBriefError("brief workspace_cards must be a non-empty tuple")
    for card in brief.workspace_cards:
        _validate_workspace_card(card)
    for field_name in ("cohort_notes", "safety_notes"):
        notes = getattr(brief, field_name)
        if not isinstance(notes, tuple) or not notes:
            raise PilotCohortBriefError(f"brief {field_name} must be a non-empty tuple")
        for note in notes:
            if not isinstance(note, str) or not note.strip():
                raise PilotCohortBriefError(f"brief {field_name} must contain non-empty strings")


def _validate_brief_summary(summary: PilotCohortBriefSummary) -> None:
    for field_name in (
        "dashboard_count",
        "metrics_available_dashboard_count",
        "metrics_unavailable_dashboard_count",
        "pilot_ready_workspace_count",
        "first_draft_output_count",
    ):
        value = getattr(summary, field_name)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise PilotCohortBriefError(f"brief summary {field_name} must be a non-negative integer")
    if (
        summary.metrics_available_dashboard_count
        + summary.metrics_unavailable_dashboard_count
        != summary.dashboard_count
    ):
        raise PilotCohortBriefError("brief summary available and unavailable counts must match dashboard count")
    if summary.pilot_ready_workspace_count > summary.metrics_available_dashboard_count:
        raise PilotCohortBriefError("brief summary ready count cannot exceed metrics-available count")
    expected_ready = (
        summary.metrics_available_dashboard_count > 0
        and summary.metrics_unavailable_dashboard_count == 0
        and summary.pilot_ready_workspace_count == summary.metrics_available_dashboard_count
    )
    if summary.ready_for_pilot_review != expected_ready:
        raise PilotCohortBriefError("brief summary ready_for_pilot_review disagrees with counts")
    for field_name in (
        "pilot_ready_workspace_rate_label",
        "median_intervention_rate_label",
    ):
        value = getattr(summary, field_name)
        if not isinstance(value, str) or not value.strip():
            raise PilotCohortBriefError(f"brief summary {field_name} must be a non-empty string")
    if not isinstance(summary.ready_for_pilot_review, bool):
        raise PilotCohortBriefError("brief summary ready_for_pilot_review must be a boolean")
    _validate_readiness_blockers(summary.readiness_blockers)


def _validate_workspace_card(card: PilotCohortWorkspaceBriefCard) -> None:
    if not isinstance(card, PilotCohortWorkspaceBriefCard):
        raise PilotCohortBriefError("workspace card must be a PilotCohortWorkspaceBriefCard")
    for field_name in (
        "title",
        "workspace",
        "dashboard_path",
        "readiness_label",
        "completion_rate_label",
        "intervention_rate_label",
    ):
        value = getattr(card, field_name)
        if not isinstance(value, str) or not value.strip():
            raise PilotCohortBriefError(f"workspace card {field_name} must be a non-empty string")
    if card.materialized_output_count is not None and (
        isinstance(card.materialized_output_count, bool)
        or not isinstance(card.materialized_output_count, int)
        or card.materialized_output_count < 0
    ):
        raise PilotCohortBriefError("workspace card materialized_output_count is invalid")
    if not isinstance(card.threshold_notes, tuple):
        raise PilotCohortBriefError("workspace card threshold_notes must be a tuple")
    for note in card.threshold_notes:
        if not isinstance(note, str) or not note.strip():
            raise PilotCohortBriefError("workspace card threshold_notes must contain non-empty strings")
    if not isinstance(card.readiness_blockers, tuple):
        raise PilotCohortBriefError("workspace card readiness_blockers must be a tuple")
    for blocker in card.readiness_blockers:
        if not isinstance(blocker, str) or blocker not in _READINESS_BLOCKER_LABELS:
            raise PilotCohortBriefError("workspace card readiness_blockers must contain known codes")
    expected_labels = _readiness_blocker_labels(card.readiness_blockers)
    if card.readiness_blocker_labels != expected_labels:
        raise PilotCohortBriefError("workspace card readiness blocker labels disagree with codes")


def _validate_readiness_blockers(blockers: PilotCohortBriefReadinessBlockers) -> None:
    if not isinstance(blockers, PilotCohortBriefReadinessBlockers):
        raise PilotCohortBriefError("brief summary readiness_blockers must be structured blocker counts")
    for field_name in _READINESS_BLOCKER_FIELDS:
        value = getattr(blockers, field_name)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise PilotCohortBriefError(f"brief summary readiness blocker {field_name} is invalid")
