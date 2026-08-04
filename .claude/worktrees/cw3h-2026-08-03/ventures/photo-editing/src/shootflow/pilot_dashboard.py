from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from shootflow.pilot_authority import observe_only_workflow_authority_to_dict
from shootflow.workspace_health import (
    WorkspaceHealthSummary,
    WorkspaceNextAction,
    build_workspace_health_summary,
)

_PILOT_DASHBOARD_SCHEMA_VERSION = 2
_BASIS_POINTS = 10_000
_DEFAULT_MIN_COMPLETION_RATE_BASIS_POINTS = 9_000
_DEFAULT_MAX_INTERVENTION_RATE_BASIS_POINTS = 2_000
_DEFAULT_MIN_MATERIALIZED_OUTPUT_COUNT = 1


class PilotDashboardError(ValueError):
    """Raised when a pilot dashboard summary cannot be built."""


@dataclass(frozen=True)
class PilotMetricSources:
    production_scheduler_report: bool
    render_scheduler_report: bool


@dataclass(frozen=True)
class PilotActivationSignals:
    production_plan_available: bool
    production_status_trusted: bool
    production_scheduler_report_trusted: bool
    render_tasks_trusted: bool
    render_status_trusted: bool
    render_scheduler_report_trusted: bool


@dataclass(frozen=True)
class PilotThroughputMetrics:
    total_work_count: int | None
    completed_work_count: int | None
    attempted_work_count: int | None
    materialized_output_count: int | None
    scheduler_iteration_count: int | None


@dataclass(frozen=True)
class PilotInterventionMetrics:
    manual_intervention_count: int | None
    retryable_work_count: int | None
    failed_work_count: int | None
    blocked_work_count: int | None
    review_required_work_count: int | None
    conflicted_lease_count: int | None
    failure_message_count: int | None
    intervention_rate_basis_count: int | None


@dataclass(frozen=True)
class PilotAcceptanceThresholds:
    min_completion_rate_basis_points: int = _DEFAULT_MIN_COMPLETION_RATE_BASIS_POINTS
    max_intervention_rate_basis_points: int = _DEFAULT_MAX_INTERVENTION_RATE_BASIS_POINTS
    min_materialized_output_count: int = _DEFAULT_MIN_MATERIALIZED_OUTPUT_COUNT


@dataclass(frozen=True)
class PilotAcceptanceAssessment:
    thresholds: PilotAcceptanceThresholds
    metrics_available: bool
    completion_rate_basis_points: int | None
    intervention_rate_basis_points: int | None
    materialized_output_count: int | None
    meets_completion_threshold: bool | None
    meets_intervention_threshold: bool | None
    meets_output_threshold: bool | None
    ready_for_pilot_review: bool
    threshold_notes: tuple[str, ...]


@dataclass(frozen=True)
class PilotDashboardSummary:
    workspace_root: Path
    generated_at: str
    shoot_slug: str | None
    workflow_state: str
    next_action: WorkspaceNextAction
    metric_sources: PilotMetricSources
    activation: PilotActivationSignals
    throughput: PilotThroughputMetrics
    intervention: PilotInterventionMetrics
    pilot_acceptance: PilotAcceptanceAssessment
    safety_notes: tuple[str, ...]


def build_pilot_dashboard_summary(
    workspace_root: Path | str,
    *,
    generated_at: str,
) -> PilotDashboardSummary:
    """Build a read-only pilot dashboard from trusted workspace-health state."""

    _validate_timestamp(generated_at)
    health = build_workspace_health_summary(workspace_root)
    metric_sources = PilotMetricSources(
        production_scheduler_report=health.production_scheduler_product_metrics is not None,
        render_scheduler_report=health.render_scheduler_product_metrics is not None,
    )
    metrics = _trusted_metric_sources(health)
    throughput = _throughput_metrics(metrics)
    intervention = _intervention_metrics(metrics)
    summary = PilotDashboardSummary(
        workspace_root=health.workspace_root,
        generated_at=generated_at,
        shoot_slug=health.shoot_slug,
        workflow_state=_workflow_state(health.next_action),
        next_action=health.next_action,
        metric_sources=metric_sources,
        activation=PilotActivationSignals(
            production_plan_available=health.production_plan_exists,
            production_status_trusted=health.production_status.valid,
            production_scheduler_report_trusted=health.production_scheduler_report.valid,
            render_tasks_trusted=health.render_tasks.valid,
            render_status_trusted=health.render_status.valid,
            render_scheduler_report_trusted=health.scheduler_report.valid,
        ),
        throughput=throughput,
        intervention=intervention,
        pilot_acceptance=_pilot_acceptance_assessment(
            throughput,
            intervention,
            thresholds=PilotAcceptanceThresholds(),
        ),
        safety_notes=(
            "pilot-dashboard is read-only and consumes workspace-health instead of raw worker internals",
            "metric counts are unavailable until trusted scheduler reports validate",
            "pilot acceptance thresholds are observational and do not authorize workflow actions",
            "dashboard summaries do not grant copy, retry, cleanup, overwrite, materialization, or deletion authority",
        ),
    )
    _validate_dashboard_summary(summary)
    return summary


def pilot_dashboard_summary_to_dict(summary: PilotDashboardSummary) -> dict[str, object]:
    if not isinstance(summary, PilotDashboardSummary):
        raise PilotDashboardError("summary must be a PilotDashboardSummary")
    _validate_dashboard_summary(summary)
    return {
        "schema_version": _PILOT_DASHBOARD_SCHEMA_VERSION,
        "generated_at": summary.generated_at,
        "workspace": str(summary.workspace_root),
        "shoot_slug": summary.shoot_slug,
        "workflow_authority": observe_only_workflow_authority_to_dict(),
        "workflow_state": summary.workflow_state,
        "next_action": _next_action_to_dict(summary.next_action),
        "metric_sources": {
            "production_scheduler_report": summary.metric_sources.production_scheduler_report,
            "render_scheduler_report": summary.metric_sources.render_scheduler_report,
        },
        "activation": {
            "production_plan_available": summary.activation.production_plan_available,
            "production_status_trusted": summary.activation.production_status_trusted,
            "production_scheduler_report_trusted": (
                summary.activation.production_scheduler_report_trusted
            ),
            "render_tasks_trusted": summary.activation.render_tasks_trusted,
            "render_status_trusted": summary.activation.render_status_trusted,
            "render_scheduler_report_trusted": (
                summary.activation.render_scheduler_report_trusted
            ),
        },
        "throughput": {
            "total_work_count": summary.throughput.total_work_count,
            "completed_work_count": summary.throughput.completed_work_count,
            "attempted_work_count": summary.throughput.attempted_work_count,
            "materialized_output_count": summary.throughput.materialized_output_count,
            "scheduler_iteration_count": summary.throughput.scheduler_iteration_count,
        },
        "intervention": {
            "manual_intervention_count": summary.intervention.manual_intervention_count,
            "retryable_work_count": summary.intervention.retryable_work_count,
            "failed_work_count": summary.intervention.failed_work_count,
            "blocked_work_count": summary.intervention.blocked_work_count,
            "review_required_work_count": summary.intervention.review_required_work_count,
            "conflicted_lease_count": summary.intervention.conflicted_lease_count,
            "failure_message_count": summary.intervention.failure_message_count,
            "intervention_rate_basis_count": (
                summary.intervention.intervention_rate_basis_count
            ),
        },
        "pilot_acceptance": _pilot_acceptance_to_dict(summary.pilot_acceptance),
        "safety_notes": list(summary.safety_notes),
    }


def _trusted_metric_sources(summary: WorkspaceHealthSummary) -> tuple[Mapping[str, int], ...]:
    sources: list[Mapping[str, int]] = []
    if summary.production_scheduler_product_metrics is not None:
        sources.append(summary.production_scheduler_product_metrics)
    if summary.render_scheduler_product_metrics is not None:
        sources.append(summary.render_scheduler_product_metrics)
    return tuple(sources)


def _throughput_metrics(
    metrics: tuple[Mapping[str, int], ...],
) -> PilotThroughputMetrics:
    if not metrics:
        return PilotThroughputMetrics(
            total_work_count=None,
            completed_work_count=None,
            attempted_work_count=None,
            materialized_output_count=None,
            scheduler_iteration_count=None,
        )
    return PilotThroughputMetrics(
        total_work_count=_sum_metrics(metrics, "total_job_count", "total_task_count"),
        completed_work_count=_sum_metrics(
            metrics,
            "completed_job_count",
            "completed_task_count",
        ),
        attempted_work_count=_sum_metrics(
            metrics,
            "attempted_job_count",
            "attempted_task_count",
        ),
        materialized_output_count=_sum_metrics(metrics, "materialized_output_count"),
        scheduler_iteration_count=_sum_metrics(metrics, "iteration_count"),
    )


def _intervention_metrics(
    metrics: tuple[Mapping[str, int], ...],
) -> PilotInterventionMetrics:
    if not metrics:
        return PilotInterventionMetrics(
            manual_intervention_count=None,
            retryable_work_count=None,
            failed_work_count=None,
            blocked_work_count=None,
            review_required_work_count=None,
            conflicted_lease_count=None,
            failure_message_count=None,
            intervention_rate_basis_count=None,
        )
    review_required = _sum_metrics(
        metrics,
        "review_required_job_count",
        "review_required_task_count",
    )
    retryable = _sum_metrics(metrics, "retryable_job_count", "retryable_task_count")
    failed = _sum_metrics(metrics, "failed_job_count", "failed_task_count")
    blocked = _sum_metrics(metrics, "blocked_job_count", "blocked_task_count")
    conflicted = _sum_metrics(
        metrics,
        "conflicted_lease_job_count",
        "conflicted_lease_task_count",
    )
    return PilotInterventionMetrics(
        manual_intervention_count=review_required,
        retryable_work_count=retryable,
        failed_work_count=failed,
        blocked_work_count=blocked,
        review_required_work_count=review_required,
        conflicted_lease_count=conflicted,
        failure_message_count=_sum_metrics(metrics, "failure_message_count"),
        intervention_rate_basis_count=_sum_metrics(
            metrics,
            "total_job_count",
            "total_task_count",
        ),
    )


def _sum_metrics(metrics: tuple[Mapping[str, int], ...], *names: str) -> int:
    total = 0
    for metric_source in metrics:
        for name in names:
            total += metric_source.get(name, 0)
    return total


def _pilot_acceptance_assessment(
    throughput: PilotThroughputMetrics,
    intervention: PilotInterventionMetrics,
    *,
    thresholds: PilotAcceptanceThresholds,
) -> PilotAcceptanceAssessment:
    _validate_acceptance_thresholds(thresholds)
    total_work = throughput.total_work_count
    completed_work = throughput.completed_work_count
    materialized_outputs = _acceptance_output_evidence_count(throughput)
    manual_interventions = intervention.manual_intervention_count
    intervention_basis = intervention.intervention_rate_basis_count
    metrics_available = all(
        value is not None
        for value in (
            total_work,
            completed_work,
            materialized_outputs,
            manual_interventions,
            intervention_basis,
        )
    )
    if (
        not metrics_available
        or total_work is None
        or completed_work is None
        or materialized_outputs is None
        or manual_interventions is None
        or intervention_basis is None
        or total_work <= 0
        or intervention_basis <= 0
    ):
        return PilotAcceptanceAssessment(
            thresholds=thresholds,
            metrics_available=False,
            completion_rate_basis_points=None,
            intervention_rate_basis_points=None,
            materialized_output_count=materialized_outputs,
            meets_completion_threshold=None,
            meets_intervention_threshold=None,
            meets_output_threshold=None,
            ready_for_pilot_review=False,
            threshold_notes=("trusted scheduler metrics are required before pilot acceptance can be evaluated",),
        )

    completion_rate = _floor_rate_basis_points(completed_work, total_work)
    intervention_rate = _ceil_rate_basis_points(manual_interventions, intervention_basis)
    meets_completion = completion_rate >= thresholds.min_completion_rate_basis_points
    meets_intervention = intervention_rate <= thresholds.max_intervention_rate_basis_points
    meets_outputs = materialized_outputs >= thresholds.min_materialized_output_count
    notes: list[str] = []
    if not meets_completion:
        notes.append("completion rate is below the pilot acceptance threshold")
    if not meets_intervention:
        notes.append("manual intervention rate is above the pilot acceptance threshold")
    if not meets_outputs:
        notes.append("materialized output count is below the pilot acceptance threshold")
    if not notes:
        notes.append("trusted dashboard metrics meet the default pilot acceptance thresholds")

    return PilotAcceptanceAssessment(
        thresholds=thresholds,
        metrics_available=True,
        completion_rate_basis_points=completion_rate,
        intervention_rate_basis_points=intervention_rate,
        materialized_output_count=materialized_outputs,
        meets_completion_threshold=meets_completion,
        meets_intervention_threshold=meets_intervention,
        meets_output_threshold=meets_outputs,
        ready_for_pilot_review=meets_completion and meets_intervention and meets_outputs,
        threshold_notes=tuple(notes),
    )


def _floor_rate_basis_points(numerator: int, denominator: int) -> int:
    return (numerator * _BASIS_POINTS) // denominator


def _ceil_rate_basis_points(numerator: int, denominator: int) -> int:
    return (numerator * _BASIS_POINTS + denominator - 1) // denominator


def _acceptance_output_evidence_count(throughput: PilotThroughputMetrics) -> int | None:
    candidates = [
        value
        for value in (
            throughput.materialized_output_count,
            throughput.completed_work_count,
        )
        if value is not None
    ]
    if not candidates:
        return None
    return max(candidates)


def _pilot_acceptance_to_dict(assessment: PilotAcceptanceAssessment) -> dict[str, object]:
    _validate_acceptance_assessment(assessment)
    return {
        "thresholds": {
            "min_completion_rate_basis_points": (
                assessment.thresholds.min_completion_rate_basis_points
            ),
            "max_intervention_rate_basis_points": (
                assessment.thresholds.max_intervention_rate_basis_points
            ),
            "min_materialized_output_count": assessment.thresholds.min_materialized_output_count,
        },
        "metrics_available": assessment.metrics_available,
        "completion_rate_basis_points": assessment.completion_rate_basis_points,
        "intervention_rate_basis_points": assessment.intervention_rate_basis_points,
        "materialized_output_count": assessment.materialized_output_count,
        "meets_completion_threshold": assessment.meets_completion_threshold,
        "meets_intervention_threshold": assessment.meets_intervention_threshold,
        "meets_output_threshold": assessment.meets_output_threshold,
        "ready_for_pilot_review": assessment.ready_for_pilot_review,
        "threshold_notes": list(assessment.threshold_notes),
    }


def _workflow_state(next_action: WorkspaceNextAction) -> str:
    name = next_action.name
    if name == "review_deliverables":
        return "ready_for_review"
    if name.startswith("review_"):
        return "needs_human_review"
    if name.startswith("init_"):
        return "ready_to_initialize"
    if name.startswith("run_"):
        return "ready_to_advance"
    if name == "write_render_tasks":
        return "ready_to_prepare_render"
    return "unknown"


def _next_action_to_dict(action: WorkspaceNextAction) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": action.name,
        "writes_files": action.writes_files,
        "authority": "observe_only",
    }
    if action.command and not action.writes_files:
        payload["command"] = list(action.command)
    elif action.command:
        payload["command_omitted_reason"] = (
            "pilot-dashboard does not emit executable write-capable commands"
        )
    if action.requires_runtime_args and not action.writes_files:
        payload["requires_runtime_args"] = list(action.requires_runtime_args)
    if action.requires:
        payload["requires"] = list(action.requires)
    return payload


def _validate_dashboard_summary(summary: PilotDashboardSummary) -> None:
    if not isinstance(summary, PilotDashboardSummary):
        raise PilotDashboardError("summary must be a PilotDashboardSummary")
    if not isinstance(summary.workspace_root, Path):
        raise PilotDashboardError("summary workspace_root must be a Path")
    _validate_timestamp(summary.generated_at)
    if summary.shoot_slug is not None and not isinstance(summary.shoot_slug, str):
        raise PilotDashboardError("summary shoot_slug must be a string or None")
    if summary.workflow_state not in {
        "needs_human_review",
        "ready_for_review",
        "ready_to_advance",
        "ready_to_initialize",
        "ready_to_prepare_render",
        "unknown",
    }:
        raise PilotDashboardError("summary workflow_state is invalid")
    if not isinstance(summary.next_action, WorkspaceNextAction):
        raise PilotDashboardError("summary next_action must be a WorkspaceNextAction")
    _validate_optional_non_negative_metrics(summary.throughput)
    _validate_optional_non_negative_metrics(summary.intervention)
    _validate_acceptance_assessment(summary.pilot_acceptance)
    if not isinstance(summary.safety_notes, tuple):
        raise PilotDashboardError("summary safety_notes must be a tuple")
    for note in summary.safety_notes:
        if not isinstance(note, str) or not note.strip():
            raise PilotDashboardError("summary safety_notes must contain non-empty strings")


def _validate_optional_non_negative_metrics(metrics: object) -> None:
    for field_name, value in getattr(metrics, "__dict__", {}).items():
        if value is None:
            continue
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise PilotDashboardError(f"{field_name} must be a non-negative integer or None")


def _validate_acceptance_assessment(assessment: PilotAcceptanceAssessment) -> None:
    if not isinstance(assessment, PilotAcceptanceAssessment):
        raise PilotDashboardError("pilot_acceptance must be a PilotAcceptanceAssessment")
    _validate_acceptance_thresholds(assessment.thresholds)
    if not isinstance(assessment.metrics_available, bool):
        raise PilotDashboardError("pilot_acceptance metrics_available must be a boolean")
    if not isinstance(assessment.ready_for_pilot_review, bool):
        raise PilotDashboardError("pilot_acceptance ready_for_pilot_review must be a boolean")
    for field_name in (
        "completion_rate_basis_points",
        "intervention_rate_basis_points",
        "materialized_output_count",
    ):
        value = getattr(assessment, field_name)
        if value is None:
            continue
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise PilotDashboardError(f"pilot_acceptance {field_name} is invalid")
    for field_name in (
        "meets_completion_threshold",
        "meets_intervention_threshold",
        "meets_output_threshold",
    ):
        value = getattr(assessment, field_name)
        if value is not None and not isinstance(value, bool):
            raise PilotDashboardError(f"pilot_acceptance {field_name} must be a boolean or None")
    if not isinstance(assessment.threshold_notes, tuple):
        raise PilotDashboardError("pilot_acceptance threshold_notes must be a tuple")
    for note in assessment.threshold_notes:
        if not isinstance(note, str) or not note.strip():
            raise PilotDashboardError("pilot_acceptance threshold_notes must contain non-empty strings")


def _validate_acceptance_thresholds(thresholds: PilotAcceptanceThresholds) -> None:
    if not isinstance(thresholds, PilotAcceptanceThresholds):
        raise PilotDashboardError("thresholds must be PilotAcceptanceThresholds")
    for field_name in (
        "min_completion_rate_basis_points",
        "max_intervention_rate_basis_points",
        "min_materialized_output_count",
    ):
        value = getattr(thresholds, field_name)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise PilotDashboardError(f"threshold {field_name} must be a non-negative integer")
    if thresholds.min_completion_rate_basis_points > _BASIS_POINTS:
        raise PilotDashboardError("min_completion_rate_basis_points cannot exceed 10000")
    if thresholds.max_intervention_rate_basis_points > _BASIS_POINTS:
        raise PilotDashboardError("max_intervention_rate_basis_points cannot exceed 10000")


def _validate_timestamp(timestamp: str) -> None:
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise PilotDashboardError("generated_at must be a non-empty string")
    if len(timestamp) > 80 or "\x00" in timestamp or "\n" in timestamp or "\r" in timestamp:
        raise PilotDashboardError("generated_at is invalid")
