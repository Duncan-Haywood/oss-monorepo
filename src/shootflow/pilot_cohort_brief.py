from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

_PILOT_COHORT_BRIEF_SCHEMA_VERSION = 1
_PILOT_COHORT_REPORT_SCHEMA_VERSION = 1
_BASIS_POINTS = 10_000


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
    source_generated_at = _required_string(payload, "generated_at", path)
    summary = _brief_summary_from_cohort(cohort, path=path)
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
            }
            for card in brief.workspace_cards
        ],
        "cohort_notes": list(brief.cohort_notes),
        "safety_notes": list(brief.safety_notes),
    }


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
    return payload


def _brief_summary_from_cohort(
    cohort: Mapping[str, object],
    *,
    path: Path,
) -> PilotCohortBriefSummary:
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
