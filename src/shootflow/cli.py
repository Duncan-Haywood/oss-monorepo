from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import TextIO

from shootflow.assembly import (
    AssemblyPlan,
    AssemblyPlanError,
    build_assembly_plan,
    ensure_render_tasks_manifest,
    load_trusted_render_tasks_manifest,
)
from shootflow.card_workflow import (
    CardDumpWorkflowError,
    CardDumpWorkflowReport,
    run_card_dump_workflow,
)
from shootflow.catalog import CatalogError, load_ingest_manifest, production_assets_from_manifest
from shootflow.ingest import (
    CopyPlan,
    CopyReport,
    ImportSourceEstimate,
    IngestError,
    estimate_import_source,
    execute_copy_plan,
    plan_import,
)
from shootflow.production import ProductionPlanError, build_production_plan
from shootflow.production_handoff import (
    ProductionHandoffError,
    ProductionWaveHandoff,
    plan_next_production_wave,
)
from shootflow.production_report import ProductionPlanReport, build_production_plan_report
from shootflow.render_scheduler import (
    DryRunRenderSchedulerError,
    DryRunRenderSchedulerReport,
    load_dry_run_render_scheduler_report,
    run_dry_run_render_scheduler,
    write_dry_run_render_scheduler_report,
)
from shootflow.render_status import (
    RenderStatusError,
    RenderStatusInitializationResult,
    initialize_render_status_manifest,
    load_render_status_manifest,
)
from shootflow.render_workspace import RenderWorkspaceError, RenderWorkspaceReport, inspect_render_workspace
from shootflow.storage import ImportRouteRecommendation, RankedStorageCandidate, StorageCandidate
from shootflow.storage_discovery import discover_import_route, discover_storage_candidates
from shootflow.story import StoryPlanError
from shootflow.workspace_health import (
    WorkspaceHealthError,
    WorkspaceHealthSummary,
    build_workspace_health_summary,
    workspace_health_summary_to_dict,
)
from shootflow.workspace_index import (
    WorkspaceIndexError,
    build_workspace_index,
    workspace_index_to_dict,
    write_workspace_index,
)

_SCHEDULER_REPORT_SCHEMA_VERSION = 1


class ShootFlowCliError(ValueError):
    """Raised when CLI entrypoint arguments are invalid."""


def main(
    argv: Sequence[str] | None = None,
    *,
    stdout: TextIO | None = None,
    stderr: TextIO | None = None,
) -> int:
    """Run the ShootFlow command-line interface.

    The CLI is deliberately a thin wrapper around trusted core APIs. It returns
    a process-style exit code so tests and future Mac background agents can call
    it without relying on ``SystemExit``.
    """

    _validate_main_args(argv=argv, stdout=stdout, stderr=stderr)
    out = stdout if stdout is not None else sys.stdout
    err = stderr if stderr is not None else sys.stderr
    parser = _build_parser()

    try:
        args = parser.parse_args(list(argv) if argv is not None else None)
    except SystemExit as exc:
        return _system_exit_code(exc)

    try:
        if args.command == "init-render-status":
            _run_init_render_status_command(args, stdout=out)
        elif args.command == "plan-import-route":
            _run_plan_import_route_command(args, stdout=out)
        elif args.command == "dry-run-render-scheduler":
            _run_dry_run_render_scheduler_command(args, stdout=out)
        elif args.command == "preview-ingest":
            _run_preview_ingest_command(args, stdout=out)
        elif args.command == "execute-ingest":
            _run_execute_ingest_command(args, stdout=out)
        elif args.command == "plan-production":
            _run_plan_production_command(args, stdout=out)
        elif args.command == "write-render-tasks":
            _run_write_render_tasks_command(args, stdout=out)
        elif args.command == "next-production-wave":
            _run_next_production_wave_command(args, stdout=out)
        elif args.command == "card-dump-workflow":
            _run_card_dump_workflow_command(args, stdout=out)
        elif args.command == "workspace-health":
            _run_workspace_health_command(args, stdout=out)
        elif args.command == "index-workspace":
            _run_index_workspace_command(args, stdout=out)
        elif args.command == "inspect-render-workspace":
            _run_inspect_render_workspace_command(args, stdout=out)
        else:
            raise ShootFlowCliError(f"Unknown command: {args.command}")
    except (
        AssemblyPlanError,
        CatalogError,
        DryRunRenderSchedulerError,
        RenderStatusError,
        ShootFlowCliError,
        IngestError,
        FileNotFoundError,
        ProductionPlanError,
        ProductionHandoffError,
        CardDumpWorkflowError,
        StoryPlanError,
        WorkspaceHealthError,
        WorkspaceIndexError,
        RenderWorkspaceError,
    ) as exc:
        print(f"shootflow: {exc}", file=err)
        return 1
    return 0


def _run_init_render_status_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    workspace = Path(args.workspace)
    trusted_plan = load_trusted_render_tasks_manifest(workspace)
    result = initialize_render_status_manifest(workspace, trusted_plan=trusted_plan)
    stdout.write(_render_status_initialization_json(result) + "\n")


def _run_plan_import_route_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    if args.estimate_source_bytes and args.expected_import_bytes is not None:
        raise ShootFlowCliError("--estimate-source-bytes cannot be combined with --expected-import-bytes")
    if args.expected_import_bytes is not None and args.expected_import_bytes <= 0:
        raise ShootFlowCliError("--expected-import-bytes must be greater than zero")
    if args.headroom_bytes < 0:
        raise ShootFlowCliError("--headroom-bytes cannot be negative")
    volume_roots = _parse_volume_roots(args.volume_root)
    expected_import_bytes = args.expected_import_bytes
    source_estimate: ImportSourceEstimate | None = None

    if args.estimate_source_bytes:
        initial_recommendation = discover_import_route(volume_roots)
        if initial_recommendation.source is not None:
            source_estimate = estimate_import_source(initial_recommendation.source.candidate.path)
            expected_import_bytes = source_estimate.estimated_bytes
            recommendation = discover_import_route(
                volume_roots,
                expected_import_bytes=expected_import_bytes,
                headroom_bytes=args.headroom_bytes,
            )
        else:
            recommendation = initial_recommendation
    elif expected_import_bytes is not None:
        recommendation = discover_import_route(
            volume_roots,
            expected_import_bytes=expected_import_bytes,
            headroom_bytes=args.headroom_bytes,
        )
    else:
        recommendation = discover_import_route(volume_roots)

    discovered_candidates: list[StorageCandidate] = []
    if args.print_candidates:
        discovered_candidates = discover_storage_candidates(volume_roots)

    stdout.write(
        _import_route_json(
            recommendation,
            volume_roots=volume_roots,
            expected_import_bytes=expected_import_bytes,
            headroom_bytes=args.headroom_bytes,
            source_estimate=source_estimate,
            discovered_candidates=discovered_candidates,
        )
        + "\n"
    )


def _run_dry_run_render_scheduler_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    workspace = Path(args.workspace)
    trusted_plan = load_trusted_render_tasks_manifest(workspace)
    result = run_dry_run_render_scheduler(
        workspace,
        trusted_plan=trusted_plan,
        completed_dependency_ids=tuple(args.completed_dependency),
        renderer_adapter=args.renderer,
        started_at=args.started_at,
        completed_at=args.completed_at,
        max_concurrency=args.max_concurrency,
        max_iterations=args.max_iterations,
        stale_before=args.stale_before,
        lease_updated_at=args.lease_updated_at,
    )
    final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
    report_path = write_dry_run_render_scheduler_report(
        result,
        workspace,
        trusted_plan=trusted_plan,
        final_manifest=final_manifest,
        generated_at=args.generated_at,
    )
    report = load_dry_run_render_scheduler_report(
        workspace,
        trusted_plan=trusted_plan,
        final_manifest=final_manifest,
    )
    if args.print_report:
        stdout.write(_scheduler_report_json(report))
        return

    stdout.write(
        json.dumps(
            {
                "report_path": str(report_path),
                "shoot_slug": report.shoot_slug,
                "stopped_reason": report.stopped_reason,
                "review_required_task_ids": list(report.review_required_task_ids),
            },
            ensure_ascii=True,
            sort_keys=True,
        )
        + "\n"
    )


def _run_preview_ingest_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    plan = plan_import(
        args.source,
        args.destination,
        shoot_date=args.shoot_date,
        shoot_slug=args.shoot_slug,
    )
    stdout.write(_preview_ingest_json(plan))


def _run_execute_ingest_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    if not args.confirm:
        raise ShootFlowCliError(
            "execute-ingest requires --confirm; run preview-ingest first to review the planned items"
        )
    plan = plan_import(
        args.source,
        args.destination,
        shoot_date=args.shoot_date,
        shoot_slug=args.shoot_slug,
    )
    report = execute_copy_plan(plan)
    stdout.write(_execute_ingest_json(plan, report))


def _run_plan_production_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    report = build_production_plan_report(args.ingest_manifest)
    stdout.write(_production_plan_report_json(report))


def _run_write_render_tasks_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    if args.photo_set_chunk_size < 1:
        raise ShootFlowCliError("--photo-set-chunk-size must be a positive integer")

    ingest_manifest_path = Path(args.ingest_manifest)
    catalog = load_ingest_manifest(ingest_manifest_path)
    production_plan = build_production_plan(
        production_assets_from_manifest(catalog),
        shoot_slug=catalog.shoot_slug,
    )
    workspace = ingest_manifest_path.parent
    assembly_plan = build_assembly_plan(
        production_plan,
        workspace,
        photo_set_chunk_size=args.photo_set_chunk_size,
    )
    write_result = ensure_render_tasks_manifest(assembly_plan, workspace)

    stdout.write(
        _write_render_tasks_summary_json(
            assembly_plan,
            ingest_manifest_path=ingest_manifest_path,
            workspace=workspace,
            manifest_path=write_result.manifest_path,
            created=write_result.created,
        )
    )


def _run_next_production_wave_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    handoff = plan_next_production_wave(
        args.ingest_manifest,
        completed_job_ids=tuple(args.completed_job),
    )
    stdout.write(_production_wave_handoff_json(handoff))


def _run_card_dump_workflow_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    if args.headroom_bytes < 0:
        raise ShootFlowCliError("--headroom-bytes cannot be negative")
    report = run_card_dump_workflow(
        _parse_volume_roots(args.volume_root),
        shoot_date=args.shoot_date,
        shoot_slug=args.shoot_slug,
        destination_subfolder=args.destination_subfolder,
        headroom_bytes=args.headroom_bytes,
        confirm_ingest=args.confirm_ingest,
    )
    stdout.write(_card_dump_workflow_report_json(report))


def _run_workspace_health_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    summary = build_workspace_health_summary(args.workspace)
    stdout.write(_workspace_health_summary_json(summary))


def _run_index_workspace_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    workspace = Path(args.workspace)
    index = build_workspace_index(workspace, generated_at=args.generated_at)
    if args.write:
        write_workspace_index(index, workspace)
    stdout.write(
        json.dumps(
            workspace_index_to_dict(index),
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )


def _run_inspect_render_workspace_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    report = inspect_render_workspace(args.workspace)
    stdout.write(_render_workspace_report_json(report))


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="shootflow")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_status = subparsers.add_parser(
        "init-render-status",
        help="Create deliverables/render_status.json from trusted render tasks if missing.",
    )
    init_status.add_argument(
        "--workspace",
        default=".",
        help="Workspace containing deliverables/render_tasks.json.",
    )

    plan_import_route = subparsers.add_parser(
        "plan-import-route",
        help="Discover mounted storage and emit a review-required import route recommendation.",
    )
    plan_import_route.add_argument(
        "--volume-root",
        action="append",
        required=True,
        help="Volume root to scan for mounted sources/destinations (repeatable).",
    )
    plan_import_route.add_argument(
        "--expected-import-bytes",
        type=int,
        help="Estimated import bytes for destination capacity gating.",
    )
    plan_import_route.add_argument(
        "--estimate-source-bytes",
        action="store_true",
        help="Estimate import size from the discovered source media before capacity gating.",
    )
    plan_import_route.add_argument(
        "--headroom-bytes",
        type=int,
        default=32 * 1024**3,
        help="Safety headroom added to expected bytes when capacity gating is active.",
    )
    plan_import_route.add_argument(
        "--print-candidates",
        action="store_true",
        help="Include discovered storage candidates in command output.",
    )

    scheduler = subparsers.add_parser(
        "dry-run-render-scheduler",
        help="Run the trusted dry-run render scheduler and persist the UI report.",
    )
    scheduler.add_argument(
        "--workspace",
        default=".",
        help="Workspace containing deliverables/render_tasks.json and render_status.json.",
    )
    scheduler.add_argument(
        "--completed-dependency",
        action="append",
        default=[],
        help="Non-render dependency ID completed by the production planner. Repeat for each dependency.",
    )
    scheduler.add_argument("--renderer", required=True, help="Renderer adapter name, such as dry-run-local.")
    scheduler.add_argument("--started-at", required=True, help="ISO-like timestamp for worker claims.")
    scheduler.add_argument("--completed-at", required=True, help="ISO-like timestamp for worker results.")
    scheduler.add_argument("--generated-at", required=True, help="ISO-like timestamp for the scheduler report.")
    scheduler.add_argument("--max-concurrency", type=int, default=1)
    scheduler.add_argument("--max-iterations", type=int, default=1)
    scheduler.add_argument("--stale-before")
    scheduler.add_argument("--lease-updated-at")
    scheduler.add_argument(
        "--print-report",
        action="store_true",
        help="Print the persisted scheduler report JSON to stdout.",
    )

    preview = subparsers.add_parser(
        "preview-ingest",
        help="Plan a safe checksum-verified copy without copying any bytes.",
    )
    _add_ingest_shared_arguments(preview)

    execute = subparsers.add_parser(
        "execute-ingest",
        help="Execute a safe checksum-verified copy and write ingest_manifest.json.",
    )
    _add_ingest_shared_arguments(execute)
    execute.add_argument(
        "--confirm",
        action="store_true",
        help="Required to actually copy media. Without --confirm the command refuses to run.",
    )

    production = subparsers.add_parser(
        "plan-production",
        help="Summarize manifest-backed production waves after safe ingest.",
    )
    production.add_argument(
        "--ingest-manifest",
        required=True,
        help="Path to the shoot ingest_manifest.json written by execute-ingest.",
    )

    render_tasks = subparsers.add_parser(
        "write-render-tasks",
        help="Build and persist deliverables/render_tasks.json from trusted storyline and graded assets.",
    )
    render_tasks.add_argument(
        "--ingest-manifest",
        required=True,
        help="Path to the shoot ingest_manifest.json whose workspace contains analysis and graded artifacts.",
    )
    render_tasks.add_argument(
        "--photo-set-chunk-size",
        type=int,
        default=250,
        help="Maximum number of photo-set inputs per parallel export task.",
    )

    next_wave = subparsers.add_parser(
        "next-production-wave",
        help="Return the next ready manifest-backed production wave without writing artifacts.",
    )
    next_wave.add_argument(
        "--ingest-manifest",
        required=True,
        help="Path to the shoot ingest_manifest.json written by execute-ingest.",
    )
    next_wave.add_argument(
        "--completed-job",
        action="append",
        default=[],
        help="Production job ID the caller has completed. Repeat for each completed job.",
    )

    card_dump = subparsers.add_parser(
        "card-dump-workflow",
        help="Run the reviewed route -> ingest preview -> optional safe copy -> production summary flow.",
    )
    card_dump.add_argument(
        "--volume-root",
        action="append",
        required=True,
        help="Volume root to scan for mounted sources/destinations (repeatable).",
    )
    card_dump.add_argument(
        "--shoot-date",
        required=True,
        help="ISO-8601 shoot date, such as 2026-05-08.",
    )
    card_dump.add_argument(
        "--shoot-slug",
        required=True,
        help="Slug for the shoot folder. Must match ^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$.",
    )
    card_dump.add_argument(
        "--destination-subfolder",
        help="Optional relative library folder inside the selected destination volume, such as ShootFlow.",
    )
    card_dump.add_argument(
        "--headroom-bytes",
        type=int,
        default=32 * 1024**3,
        help="Safety headroom added to estimated media bytes when capacity gating the route.",
    )
    card_dump.add_argument(
        "--confirm-ingest",
        action="store_true",
        help="Actually execute the checksum-verified copy after preview. Without this, no files are copied.",
    )

    workspace_health = subparsers.add_parser(
        "workspace-health",
        help="Summarize trusted handoff health and the next safe CLI action without writing files.",
    )
    workspace_health.add_argument(
        "--workspace",
        default=".",
        help="Workspace containing ShootFlow handoff manifests.",
    )

    index = subparsers.add_parser(
        "index-workspace",
        help="Summarize trusted workspace handoff artifacts for UI or background agents.",
    )
    index.add_argument(
        "--workspace",
        default=".",
        help="Shoot workspace containing ingest/render handoff artifacts.",
    )
    index.add_argument(
        "--generated-at",
        required=True,
        help="Caller-supplied timestamp for the metadata-only index.",
    )
    index.add_argument(
        "--write",
        action="store_true",
        help="Persist shootflow_workspace_index.json in the workspace after building it.",
    )

    inspect_workspace = subparsers.add_parser(
        "inspect-render-workspace",
        help="Read persisted render handoffs and summarize safe next actions without writes.",
    )
    inspect_workspace.add_argument(
        "--workspace",
        default=".",
        help="Workspace containing deliverables/render_tasks.json.",
    )

    return parser


def _add_ingest_shared_arguments(subparser: argparse.ArgumentParser) -> None:
    subparser.add_argument(
        "--source",
        required=True,
        help="Reviewed source root, such as /Volumes/EOS_DIGITAL.",
    )
    subparser.add_argument(
        "--destination",
        required=True,
        help="Writable destination root for the dated shoot folder.",
    )
    subparser.add_argument(
        "--shoot-date",
        required=True,
        help="ISO-8601 shoot date, such as 2026-05-08.",
    )
    subparser.add_argument(
        "--shoot-slug",
        required=True,
        help="Slug for the shoot folder. Must match ^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$.",
    )


def _render_status_initialization_json(result: object) -> str:
    if not isinstance(result, RenderStatusInitializationResult):
        raise ShootFlowCliError("result must be a RenderStatusInitializationResult")
    return json.dumps(
        {
            "created": result.created,
            "status_path": str(result.manifest_path),
            "shoot_slug": result.manifest.shoot_slug,
            "render_plan_fingerprint": result.manifest.render_plan_fingerprint,
            "task_count": len(result.manifest.task_statuses),
            "pending_task_count": _render_status_count(result, "pending"),
            "running_task_count": _render_status_count(result, "running"),
            "succeeded_task_count": _render_status_count(result, "succeeded"),
            "failed_task_count": _render_status_count(result, "failed"),
            "retryable_task_count": _render_status_count(result, "retryable"),
        },
        ensure_ascii=True,
        sort_keys=True,
    )


def _render_status_count(result: object, state: str) -> int:
    if not isinstance(result, RenderStatusInitializationResult):
        raise ShootFlowCliError("result must be a RenderStatusInitializationResult")
    return sum(1 for status in result.manifest.task_statuses if status.state == state)


def _scheduler_report_json(report: DryRunRenderSchedulerReport) -> str:
    if not isinstance(report, DryRunRenderSchedulerReport):
        raise ShootFlowCliError("report must be a DryRunRenderSchedulerReport")
    return json.dumps(
        {
            "schema_version": _SCHEDULER_REPORT_SCHEMA_VERSION,
            "generated_at": report.generated_at,
            "shoot_slug": report.shoot_slug,
            "render_plan_fingerprint": report.render_plan_fingerprint,
            "renderer_adapter": report.renderer_adapter,
            "stopped_reason": report.stopped_reason,
            "iteration_count": report.iteration_count,
            "total_task_count": report.total_task_count,
            "completed_task_ids": list(report.completed_task_ids),
            "retryable_task_ids": list(report.retryable_task_ids),
            "failed_task_ids": list(report.failed_task_ids),
            "blocked_task_ids": list(report.blocked_task_ids),
            "attempted_task_ids": list(report.attempted_task_ids),
            "skipped_retryable_task_ids": list(report.skipped_retryable_task_ids),
            "expired_lease_task_ids": list(report.expired_lease_task_ids),
            "conflicted_lease_task_ids": list(report.conflicted_lease_task_ids),
            "review_required_task_ids": list(report.review_required_task_ids),
            "outputs_materialized": list(report.outputs_materialized),
            "failure_messages": [
                {"task_id": message.task_id, "message": message.message}
                for message in report.failure_messages
            ],
        },
        ensure_ascii=True,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _import_route_json(
    recommendation: ImportRouteRecommendation,
    *,
    volume_roots: list[Path],
    expected_import_bytes: int | None,
    headroom_bytes: int,
    source_estimate: ImportSourceEstimate | None,
    discovered_candidates: list[StorageCandidate],
) -> str:
    if not isinstance(recommendation, ImportRouteRecommendation):
        raise ShootFlowCliError("recommendation must be an ImportRouteRecommendation")
    payload = {
        "status": recommendation.status,
        "ready": recommendation.ready,
        "review_required": recommendation.review_required,
        "volume_roots": [str(root) for root in volume_roots],
        "source": _ranked_storage_candidate_json(recommendation.source),
        "destination": _ranked_storage_candidate_json(recommendation.destination),
        "safety_notes": list(recommendation.safety_notes),
        "expected_import_bytes": expected_import_bytes,
        "headroom_bytes": headroom_bytes if expected_import_bytes is not None else None,
        "estimated_source_media": (
            None
            if source_estimate is None
            else {
                "source_root": str(source_estimate.source_root),
                "media_file_count": source_estimate.media_file_count,
                "estimated_bytes": source_estimate.estimated_bytes,
            }
        ),
        "discovered_candidates": [_storage_candidate_json(candidate) for candidate in discovered_candidates],
    }
    return json.dumps(payload, ensure_ascii=True, sort_keys=True)


def _parse_volume_roots(raw_roots: Sequence[str]) -> list[Path]:
    roots: list[Path] = []
    for raw_root in raw_roots:
        if not isinstance(raw_root, str) or not raw_root.strip():
            raise ShootFlowCliError("volume roots must be non-empty strings")
        roots.append(Path(raw_root))
    return roots


def _ranked_storage_candidate_json(candidate: RankedStorageCandidate | None) -> dict[str, object] | None:
    if candidate is None:
        return None
    return {
        "name": candidate.candidate.name,
        "path": str(candidate.candidate.path),
        "free_bytes": candidate.candidate.free_bytes,
        "total_bytes": candidate.candidate.total_bytes,
        "is_removable": candidate.candidate.is_removable,
        "is_read_only": candidate.candidate.is_read_only,
        "role": candidate.role,
        "safety": candidate.safety,
        "confidence": candidate.confidence,
        "reasons": list(candidate.reasons),
    }


def _storage_candidate_json(candidate: StorageCandidate) -> dict[str, object]:
    return {
        "name": candidate.name,
        "path": str(candidate.path),
        "free_bytes": candidate.free_bytes,
        "total_bytes": candidate.total_bytes,
        "is_removable": candidate.is_removable,
        "is_read_only": candidate.is_read_only,
    }


def _preview_ingest_json(plan: CopyPlan) -> str:
    if not isinstance(plan, CopyPlan):
        raise ShootFlowCliError("plan must be a CopyPlan")
    total_bytes = sum(item.size_bytes for item in plan.items)
    return json.dumps(
        {
            "shoot_folder": str(plan.shoot_folder),
            "source_root": str(plan.source_root),
            "destination_root": str(plan.destination_root),
            "shoot_date": plan.shoot_date,
            "shoot_slug": plan.shoot_slug,
            "item_count": len(plan.items),
            "total_bytes": total_bytes,
            "items": [
                {
                    "relative_path": item.relative_path.as_posix(),
                    "checksum_sha256": item.checksum_sha256,
                    "size_bytes": item.size_bytes,
                }
                for item in plan.items
            ],
            "notes": [
                "preview only - no files were copied",
                "source media will not be deleted",
                "run execute-ingest --confirm to perform the copy",
                "copy is verified by SHA-256 before manifest write",
            ],
        },
        ensure_ascii=True,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _execute_ingest_json(plan: CopyPlan, report: CopyReport) -> str:
    if not isinstance(plan, CopyPlan):
        raise ShootFlowCliError("plan must be a CopyPlan")
    if not isinstance(report, CopyReport):
        raise ShootFlowCliError("report must be a CopyReport")
    total_bytes = sum(item.size_bytes for item in plan.items)
    return json.dumps(
        {
            "shoot_folder": str(plan.shoot_folder),
            "manifest_path": str(report.manifest_path),
            "shoot_date": plan.shoot_date,
            "shoot_slug": plan.shoot_slug,
            "copied": report.copied,
            "skipped": report.skipped,
            "item_count": len(plan.items),
            "total_bytes": total_bytes,
            "notes": [
                "no source files were deleted",
                "all copied files were verified by SHA-256 checksum",
                "review ingest_manifest.json before formatting the source card",
            ],
        },
        ensure_ascii=True,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _production_plan_report_json(report: ProductionPlanReport) -> str:
    if not isinstance(report, ProductionPlanReport):
        raise ShootFlowCliError("report must be a ProductionPlanReport")
    return json.dumps(
        {
            "schema_version": 1,
            "manifest_path": str(report.manifest_path),
            "workspace": str(report.workspace),
            "shoot_date": report.shoot_date,
            "shoot_slug": report.shoot_slug,
            "copied_manifest_item_count": report.copied_manifest_item_count,
            "asset_counts": {
                "photo": report.photo_asset_count,
                "video": report.video_asset_count,
                "total": report.photo_asset_count + report.video_asset_count,
            },
            "production_plan": {
                "job_count": report.production_job_count,
                "parallel_job_count": report.parallel_job_count,
                "serial_job_count": report.serial_job_count,
                "wave_count": len(report.waves),
            },
            "waves": [
                {
                    "wave_index": wave.wave_index,
                    "job_count": wave.job_count,
                    "output_kinds": list(wave.output_kinds),
                    "parallel_job_count": wave.parallel_job_count,
                    "serial_job_count": wave.serial_job_count,
                }
                for wave in report.waves
            ],
            "deliverables": [
                {
                    "job_id": deliverable.job_id,
                    "output_kind": deliverable.output_kind,
                    "outputs": list(deliverable.outputs),
                    "depends_on": list(deliverable.depends_on),
                }
                for deliverable in report.deliverables
            ],
            "notes": [
                "read-only production plan",
                "no analysis, grading, render, or deliverable files were written",
                "ingest manifest remains the safety boundary before AI/editing work",
            ],
        },
        ensure_ascii=True,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _production_wave_handoff_json(handoff: ProductionWaveHandoff) -> str:
    if not isinstance(handoff, ProductionWaveHandoff):
        raise ShootFlowCliError("handoff must be a ProductionWaveHandoff")
    return json.dumps(
        {
            "schema_version": 1,
            "manifest_path": str(handoff.manifest_path),
            "workspace": str(handoff.workspace),
            "shoot_slug": handoff.shoot_slug,
            "status": handoff.status,
            "wave_index": handoff.wave_index,
            "completed_job_ids": list(handoff.completed_job_ids),
            "blocked_dependency_ids": list(handoff.blocked_dependency_ids),
            "production_plan": {
                "job_count": len(handoff.production_plan.jobs),
                "wave_count": len(handoff.production_plan.execution_waves),
            },
            "jobs": [
                {
                    "job_id": job.job_id,
                    "output_kind": job.output_kind,
                    "inputs": list(job.inputs),
                    "outputs": list(job.outputs),
                    "depends_on": list(job.depends_on),
                    "can_run_in_parallel": job.can_run_in_parallel,
                }
                for job in handoff.jobs
            ],
            "notes": list(handoff.notes),
        },
        ensure_ascii=True,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _write_render_tasks_summary_json(
    plan: AssemblyPlan,
    *,
    ingest_manifest_path: Path,
    workspace: Path,
    manifest_path: Path,
    created: bool,
) -> str:
    if not isinstance(plan, AssemblyPlan):
        raise ShootFlowCliError("plan must be an AssemblyPlan")
    return json.dumps(
        {
            "schema_version": 1,
            "created": created,
            "ingest_manifest_path": str(ingest_manifest_path),
            "workspace": str(workspace),
            "render_tasks_manifest_path": str(manifest_path),
            "shoot_slug": plan.shoot_slug,
            "task_count": len(plan.render_tasks),
            "task_ids": [task.task_id for task in plan.render_tasks],
            "output_paths": [
                output_path
                for task in plan.render_tasks
                for output_path in task.outputs
            ],
            "next_actions": _write_render_tasks_next_actions(plan, workspace),
            "notes": [
                "writes render task manifest only",
                "requires trusted storyline and graded artifacts in the shoot workspace",
                "does not render media, delete sources, or create deliverable outputs",
            ],
        },
        ensure_ascii=True,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _write_render_tasks_next_actions(plan: AssemblyPlan, workspace: Path) -> list[dict[str, object]]:
    scheduler_command = [
        "dry-run-render-scheduler",
        "--workspace",
        str(workspace),
    ]
    for dependency_id in _non_render_dependency_ids(plan):
        scheduler_command.extend(["--completed-dependency", dependency_id])

    return [
        {
            "name": "init_render_status",
            "command": [
                "init-render-status",
                "--workspace",
                str(workspace),
            ],
            "writes_files": True,
        },
        {
            "name": "run_dry_run_render_scheduler",
            "command": scheduler_command,
            "requires_runtime_args": [
                "--renderer",
                "--started-at",
                "--completed-at",
                "--generated-at",
            ],
            "writes_files": True,
        },
    ]


def _non_render_dependency_ids(plan: AssemblyPlan) -> list[str]:
    render_task_ids = {task.task_id for task in plan.render_tasks}
    dependency_ids: list[str] = []
    seen: set[str] = set()
    for task in plan.render_tasks:
        for dependency_id in task.depends_on:
            if dependency_id in render_task_ids or dependency_id in seen:
                continue
            seen.add(dependency_id)
            dependency_ids.append(dependency_id)
    return dependency_ids



def _card_dump_workflow_report_json(report: CardDumpWorkflowReport) -> str:
    if not isinstance(report, CardDumpWorkflowReport):
        raise ShootFlowCliError("report must be a CardDumpWorkflowReport")
    return json.dumps(
        {
            "schema_version": 1,
            "status": report.status,
            "ingest_executed": report.ingest_executed,
            "agent_handoff": _card_dump_agent_handoff_json(report),
            "volume_roots": [str(root) for root in report.volume_roots],
            "route": {
                "status": report.route.status,
                "ready": report.route.ready,
                "review_required": report.route.review_required,
                "source": _ranked_storage_candidate_json(report.route.source),
                "destination": _ranked_storage_candidate_json(report.route.destination),
                "safety_notes": list(report.route.safety_notes),
            },
            "estimated_source_media": _source_estimate_json(report),
            "destination_root": (
                None if report.destination_root is None else str(report.destination_root)
            ),
            "preview": _card_dump_preview_json(report),
            "ingest": _card_dump_ingest_json(report),
            "production_report": _card_dump_production_report_json(report),
            "next_actions": _card_dump_next_actions(report),
            "notes": list(report.notes),
        },
        ensure_ascii=True,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _workspace_health_summary_json(summary: WorkspaceHealthSummary) -> str:
    if not isinstance(summary, WorkspaceHealthSummary):
        raise ShootFlowCliError("summary must be a WorkspaceHealthSummary")
    return (
        json.dumps(
            workspace_health_summary_to_dict(summary),
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )


def _render_workspace_report_json(report: RenderWorkspaceReport) -> str:
    if not isinstance(report, RenderWorkspaceReport):
        raise ShootFlowCliError("report must be a RenderWorkspaceReport")
    return json.dumps(
        {
            "schema_version": 1,
            "workspace": str(report.workspace_root),
            "shoot_slug": report.shoot_slug,
            "render_plan_fingerprint": report.render_plan_fingerprint,
            "status": report.status,
            "status_manifest_present": report.status_manifest_present,
            "scheduler_report_present": report.scheduler_report_present,
            "task_counts_by_state": report.task_counts_by_state,
            "expected_outputs": list(report.expected_outputs),
            "materialized_outputs": list(report.materialized_outputs),
            "checksum_mismatch_task_ids": list(report.checksum_mismatch_task_ids),
            "review_required_task_ids": list(report.review_required_task_ids),
            "safe_next_actions": list(report.safe_next_actions),
            "notes": [
                "read-only render workspace inspection",
                "no render status, scheduler report, or deliverable files were written",
                "safe_next_actions are recommendations, not permission to delete or overwrite media",
            ],
        },
        ensure_ascii=True,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _card_dump_agent_handoff_json(report: CardDumpWorkflowReport) -> dict[str, object]:
    if not isinstance(report, CardDumpWorkflowReport):
        raise ShootFlowCliError("report must be a CardDumpWorkflowReport")
    if report.status == "blocked":
        return {
            "next_step": "fix_route",
            "human_review_required": True,
            "safe_to_rerun": True,
            "next_step_may_copy_bytes": False,
            "requires_confirm_ingest": False,
        }
    if report.status == "ready_for_review":
        return {
            "next_step": "review_preview",
            "human_review_required": True,
            "safe_to_rerun": True,
            "next_step_may_copy_bytes": True,
            "requires_confirm_ingest": True,
        }
    if report.status == "ingest_complete":
        return {
            "next_step": "review_production_plan",
            "human_review_required": True,
            "safe_to_rerun": True,
            "next_step_may_copy_bytes": False,
            "requires_confirm_ingest": False,
        }
    raise ShootFlowCliError(f"Unsupported card workflow status: {report.status}")


def _source_estimate_json(report: CardDumpWorkflowReport) -> dict[str, object] | None:
    if report.source_estimate is None:
        return None
    return {
        "source_root": str(report.source_estimate.source_root),
        "media_file_count": report.source_estimate.media_file_count,
        "estimated_bytes": report.source_estimate.estimated_bytes,
    }


def _card_dump_preview_json(report: CardDumpWorkflowReport) -> dict[str, object] | None:
    if report.preview_plan is None:
        return None
    total_bytes = sum(item.size_bytes for item in report.preview_plan.items)
    return {
        "source_root": str(report.preview_plan.source_root),
        "destination_root": str(report.preview_plan.destination_root),
        "shoot_folder": str(report.preview_plan.shoot_folder),
        "shoot_date": report.preview_plan.shoot_date,
        "shoot_slug": report.preview_plan.shoot_slug,
        "item_count": len(report.preview_plan.items),
        "total_bytes": total_bytes,
        "items": [
            {
                "relative_path": item.relative_path.as_posix(),
                "checksum_sha256": item.checksum_sha256,
                "size_bytes": item.size_bytes,
            }
            for item in report.preview_plan.items
        ],
    }


def _card_dump_next_actions(report: CardDumpWorkflowReport) -> list[dict[str, object]]:
    if report.copy_report is not None:
        manifest_path = str(report.copy_report.manifest_path)
        storyline_requirements = [
            "analysis/instagram_storylines.json",
            "graded outputs for selected storyline assets",
        ]
        return [
            {
                "name": "prepare_storyline_and_graded_assets",
                "requires": storyline_requirements,
                "writes_files": True,
            },
            {
                "name": "write_render_tasks",
                "command": [
                    "write-render-tasks",
                    "--ingest-manifest",
                    manifest_path,
                ],
                "requires": storyline_requirements,
                "writes_files": True,
            },
        ]
    if report.preview_plan is not None:
        return [
            {
                "name": "review_and_confirm_ingest",
                "requires": [
                    "human review of source, destination, checksums, and backup notes",
                ],
                "writes_files": True,
            }
        ]
    return []


def _card_dump_ingest_json(report: CardDumpWorkflowReport) -> dict[str, object] | None:
    if report.copy_report is None:
        return None
    return {
        "copied": report.copy_report.copied,
        "skipped": report.copy_report.skipped,
        "manifest_path": str(report.copy_report.manifest_path),
    }


def _card_dump_production_report_json(report: CardDumpWorkflowReport) -> dict[str, object] | None:
    if report.production_report is None:
        return None
    production_report = report.production_report
    return {
        "manifest_path": str(production_report.manifest_path),
        "workspace": str(production_report.workspace),
        "shoot_date": production_report.shoot_date,
        "shoot_slug": production_report.shoot_slug,
        "copied_manifest_item_count": production_report.copied_manifest_item_count,
        "asset_counts": {
            "photo": production_report.photo_asset_count,
            "video": production_report.video_asset_count,
            "total": production_report.photo_asset_count + production_report.video_asset_count,
        },
        "production_plan": {
            "job_count": production_report.production_job_count,
            "parallel_job_count": production_report.parallel_job_count,
            "serial_job_count": production_report.serial_job_count,
            "wave_count": len(production_report.waves),
        },
        "deliverables": [
            {
                "job_id": deliverable.job_id,
                "output_kind": deliverable.output_kind,
                "outputs": list(deliverable.outputs),
                "depends_on": list(deliverable.depends_on),
            }
            for deliverable in production_report.deliverables
        ],
        "wrote_downstream_files": False,
    }


def _validate_main_args(
    *,
    argv: Sequence[str] | None,
    stdout: TextIO | None,
    stderr: TextIO | None,
) -> None:
    if argv is not None:
        if isinstance(argv, str):
            raise ShootFlowCliError("argv must be a sequence of strings, not a string")
        for arg in argv:
            if not isinstance(arg, str):
                raise ShootFlowCliError("argv must contain only strings")
    for label, stream in (("stdout", stdout), ("stderr", stderr)):
        if stream is not None and not callable(getattr(stream, "write", None)):
            raise ShootFlowCliError(f"{label} must be a writable text stream")


def _system_exit_code(exc: SystemExit) -> int:
    code = exc.code
    if code is None:
        return 0
    if isinstance(code, int):
        return code
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
