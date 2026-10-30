from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import TextIO

from shootflow.cull import (
    CullError,
    cull_folder,
    thumbnail_data_uris,
    pick_score_to_dict,
    read_picks,
    result_to_dict,
    score_against_picks,
    write_report,
    write_sidecars,
)
from shootflow.ffmpeg_media import FfmpegMediaError
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
from shootflow.demo_workspace import (
    CardDumpCliDemoWorkspace,
    DemoWorkspaceError,
    PersistedCliDemoWorkspace,
    PilotCohortCliDemoWorkspace,
    create_card_dump_cli_demo_workspace,
    create_persisted_cli_demo_workspace,
    create_pilot_cohort_cli_demo_workspace,
)
from shootflow.ingest import (
    CopyPlan,
    CopyReport,
    ImportSourceEstimate,
    IngestError,
    estimate_import_source,
    execute_copy_plan,
    plan_import,
)
from shootflow.local_pipeline import (
    LocalPipelineError,
    launchd_plist_bytes,
    local_pipeline_result_to_dict,
    run_local_pipeline,
)
from shootflow.production import ProductionPlan, ProductionPlanError, build_production_plan
from shootflow.production_handoff import (
    ProductionHandoffError,
    ProductionWaveHandoff,
    plan_next_production_wave,
    plan_next_production_wave_from_status,
)
from shootflow.pilot_dashboard import (
    PilotDashboardError,
    PilotDashboardSummary,
    build_pilot_dashboard_summary,
    pilot_dashboard_summary_to_dict,
)
from shootflow.pilot_cohort_report import (
    PilotCohortReport,
    PilotCohortReportError,
    build_pilot_cohort_report_from_paths,
    pilot_cohort_report_to_dict,
)
from shootflow.pilot_cohort_brief import (
    PilotCohortBrief,
    PilotCohortBriefError,
    build_pilot_cohort_brief_from_report_path,
    pilot_cohort_brief_to_dict,
    pilot_cohort_brief_to_text,
)
from shootflow.production_report import ProductionPlanReport, build_production_plan_report
from shootflow.production_scheduler import (
    PRODUCTION_SCHEDULER_REPORT_PATH,
    DryRunProductionSchedulerReport,
    DryRunProductionSchedulerError,
    load_dry_run_production_scheduler_report,
    run_dry_run_production_scheduler,
    write_dry_run_production_scheduler_report,
)
from shootflow.production_status import (
    ProductionStatusError,
    ProductionStatusInitializationResult,
    ProductionStatusManifest,
    initialize_production_status_manifest,
    load_production_status_manifest,
)
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
from shootflow.storage_discovery import (
    StorageDiscoveryError,
    VolumeDiscoveryHint,
    discover_import_route,
    discover_storage_candidates,
)
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
from shootflow.workflow_authority import (
    WorkflowAuthorityError,
    observe_only_handoff_controls_to_dict,
    observe_only_workflow_authority_to_dict,
)

_SCHEDULER_REPORT_SCHEMA_VERSION = 3
_CLI_HANDOFF_SCHEMA_VERSION = 2
_PACKAGE_OUTPUT_KINDS = frozenset(
    {"instagram_reel", "instagram_carousel", "instagram_photo_set"}
)


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
        elif args.command == "init-production-status":
            _run_init_production_status_command(args, stdout=out)
        elif args.command == "dry-run-production-scheduler":
            _run_dry_run_production_scheduler_command(args, stdout=out)
        elif args.command == "write-render-tasks":
            _run_write_render_tasks_command(args, stdout=out)
        elif args.command == "next-production-wave":
            _run_next_production_wave_command(args, stdout=out)
        elif args.command == "card-dump-workflow":
            _run_card_dump_workflow_command(args, stdout=out)
        elif args.command == "handoff-controls":
            _run_handoff_controls_command(args, stdout=out)
        elif args.command == "package-handoff-brief":
            _run_package_handoff_brief_command(args, stdout=out)
        elif args.command == "workspace-health":
            _run_workspace_health_command(args, stdout=out)
        elif args.command == "index-workspace":
            _run_index_workspace_command(args, stdout=out)
        elif args.command == "pilot-dashboard":
            _run_pilot_dashboard_command(args, stdout=out)
        elif args.command == "pilot-cohort-report":
            _run_pilot_cohort_report_command(args, stdout=out)
        elif args.command == "pilot-cohort-brief":
            _run_pilot_cohort_brief_command(args, stdout=out)
        elif args.command == "inspect-render-workspace":
            _run_inspect_render_workspace_command(args, stdout=out)
        elif args.command == "cull":
            _run_cull_command(args, stdout=out)
        elif args.command == "create-demo-workspace":
            _run_create_demo_workspace_command(args, stdout=out)
        elif args.command == "create-card-dump-demo-workspace":
            _run_create_card_dump_demo_workspace_command(args, stdout=out)
        elif args.command == "create-pilot-cohort-demo":
            _run_create_pilot_cohort_demo_command(args, stdout=out)
        elif args.command == "run-local-pipeline":
            return _run_local_pipeline_command(args, stdout=out, stderr=err)
        elif args.command == "write-launchd-plist":
            _run_write_launchd_plist_command(args, stdout=out)
        else:
            raise ShootFlowCliError(f"Unknown command: {args.command}")
    except (
        AssemblyPlanError,
        CatalogError,
        DryRunRenderSchedulerError,
        DryRunProductionSchedulerError,
        RenderStatusError,
        ShootFlowCliError,
        IngestError,
        FileNotFoundError,
        ProductionPlanError,
        ProductionHandoffError,
        ProductionStatusError,
        CardDumpWorkflowError,
        StoryPlanError,
        WorkspaceHealthError,
        WorkspaceIndexError,
        PilotDashboardError,
        PilotCohortReportError,
        PilotCohortBriefError,
        RenderWorkspaceError,
        DemoWorkspaceError,
        StorageDiscoveryError,
        WorkflowAuthorityError,
        LocalPipelineError,
        CullError,
        FfmpegMediaError,
    ) as exc:
        print(f"shootflow: {exc}", file=err)
        return 1
    return 0


def _run_local_pipeline_command(args: argparse.Namespace, *, stdout: TextIO, stderr: TextIO) -> int:
    exit_code = 0
    for manifest in args.ingest_manifest:
        try:
            result = run_local_pipeline(
                manifest,
                max_concurrency=args.max_concurrency,
                max_iterations=args.max_iterations,
                retry_retryable=args.retry_retryable,
            )
        except (ValueError, OSError) as exc:  # one bad shoot must not stop the rest of the queue
            print(f"shootflow: {manifest}: {exc}", file=stderr)
            exit_code = 1
            continue
        stdout.write(json.dumps(local_pipeline_result_to_dict(result), ensure_ascii=True, sort_keys=True) + "\n")
        if result.needs_review_ids or not result.rendered:
            exit_code = max(exit_code, 2)
    return exit_code


def _run_write_launchd_plist_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    content = launchd_plist_bytes(
        ingest_manifests=args.ingest_manifest,
        hour=args.hour,
        minute=args.minute,
        max_concurrency=args.max_concurrency,
        log_path=args.log,
        source_root=Path(__file__).resolve().parent.parent,
    )
    if args.output:
        output = Path(args.output).expanduser()
        if output.exists():
            raise ShootFlowCliError(f"Refusing to overwrite existing plist: {output}")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(content)
        stdout.write(json.dumps({"plist_path": str(output)}, ensure_ascii=True) + "\n")
        return
    stdout.write(content.decode("utf-8"))


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
    volume_hints = _load_volume_metadata_json(args.volume_metadata_json)
    expected_import_bytes = args.expected_import_bytes
    source_estimate: ImportSourceEstimate | None = None

    if args.estimate_source_bytes:
        initial_recommendation = discover_import_route(volume_roots, volume_hints=volume_hints)
        if initial_recommendation.source is not None:
            source_estimate = estimate_import_source(initial_recommendation.source.candidate.path)
            expected_import_bytes = source_estimate.estimated_bytes
            recommendation = discover_import_route(
                volume_roots,
                expected_import_bytes=expected_import_bytes,
                headroom_bytes=args.headroom_bytes,
                volume_hints=volume_hints,
            )
        else:
            recommendation = initial_recommendation
    elif expected_import_bytes is not None:
        recommendation = discover_import_route(
            volume_roots,
            expected_import_bytes=expected_import_bytes,
            headroom_bytes=args.headroom_bytes,
            volume_hints=volume_hints,
        )
    else:
        recommendation = discover_import_route(volume_roots, volume_hints=volume_hints)

    discovered_candidates: list[StorageCandidate] = []
    if args.print_candidates:
        discovered_candidates = discover_storage_candidates(volume_roots, volume_hints=volume_hints)

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


def _run_init_production_status_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    manifest_path = Path(args.ingest_manifest)
    catalog = load_ingest_manifest(manifest_path)
    trusted_plan = build_production_plan(
        production_assets_from_manifest(catalog),
        shoot_slug=catalog.shoot_slug,
    )
    result = initialize_production_status_manifest(manifest_path.parent, trusted_plan=trusted_plan)
    stdout.write(_production_status_initialization_json(result) + "\n")


def _run_dry_run_production_scheduler_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    manifest_path = Path(args.ingest_manifest)
    catalog = load_ingest_manifest(manifest_path)
    trusted_plan = build_production_plan(
        production_assets_from_manifest(catalog),
        shoot_slug=catalog.shoot_slug,
    )
    workspace = manifest_path.parent
    result = run_dry_run_production_scheduler(
        workspace,
        trusted_plan=trusted_plan,
        worker_adapter=args.worker,
        started_at=args.started_at,
        completed_at=args.completed_at,
        max_concurrency=args.max_concurrency,
        max_iterations=args.max_iterations,
        reviewed_retryable_job_ids=tuple(args.retryable_job),
        stale_before=args.stale_before,
        lease_updated_at=args.lease_updated_at,
    )
    final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
    report_path = write_dry_run_production_scheduler_report(
        result,
        workspace,
        trusted_plan=trusted_plan,
        final_manifest=final_manifest,
        generated_at=args.generated_at,
    )
    report = load_dry_run_production_scheduler_report(
        workspace,
        trusted_plan=trusted_plan,
        final_manifest=final_manifest,
    )
    if args.print_report:
        stdout.write(_production_scheduler_report_json(report))
        return

    stdout.write(
        _dry_run_production_scheduler_summary_json(
            report,
            ingest_manifest_path=manifest_path,
            workspace=workspace,
            report_path=report_path,
        )
    )


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
    if args.use_production_status:
        if args.completed_job:
            raise ShootFlowCliError(
                "--completed-job cannot be combined with --use-production-status"
            )
        handoff = plan_next_production_wave_from_status(args.ingest_manifest)
    else:
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
        volume_hints=_load_volume_metadata_json(args.volume_metadata_json),
    )
    stdout.write(_card_dump_workflow_report_json(report))


def _run_handoff_controls_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    handoff_path = Path(args.handoff_json)
    payload = _load_handoff_controls_payload(handoff_path)
    controls = observe_only_handoff_controls_to_dict(payload, field_label=args.field_label)
    stdout.write(_handoff_controls_json(handoff_path=handoff_path, controls=controls))


def _run_package_handoff_brief_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    manifest_path = Path(args.ingest_manifest)
    catalog = load_ingest_manifest(manifest_path)
    trusted_plan = build_production_plan(
        production_assets_from_manifest(catalog),
        shoot_slug=catalog.shoot_slug,
    )
    workspace = manifest_path.parent
    final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
    report = load_dry_run_production_scheduler_report(
        workspace,
        trusted_plan=trusted_plan,
        final_manifest=final_manifest,
    )
    brief = _package_handoff_brief(
        report,
        trusted_plan=trusted_plan,
        final_manifest=final_manifest,
        ingest_manifest_path=manifest_path,
        workspace=workspace,
    )
    if args.format == "text":
        stdout.write(_package_handoff_brief_text(brief))
    else:
        stdout.write(
            _package_handoff_brief_json(
                report,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                ingest_manifest_path=manifest_path,
                workspace=workspace,
            )
        )


def _package_handoff_brief(
    report: DryRunProductionSchedulerReport,
    *,
    trusted_plan: ProductionPlan,
    final_manifest: ProductionStatusManifest,
    ingest_manifest_path: Path,
    workspace: Path,
) -> dict[str, object]:
    return json.loads(
        _package_handoff_brief_json(
            report,
            trusted_plan=trusted_plan,
            final_manifest=final_manifest,
            ingest_manifest_path=ingest_manifest_path,
            workspace=workspace,
        )
    )


def _package_handoff_brief_text(brief: dict[str, object]) -> str:
    readiness = brief["package_readiness"]
    if not isinstance(readiness, dict):
        raise ShootFlowCliError("package readiness must be an object")
    status = readiness["status"]
    completed = readiness["completed_package_job_ids"]
    review_required = readiness["review_required_package_job_ids"]
    materialized = readiness["materialized_package_outputs"]
    if not all(isinstance(value, list) for value in (completed, review_required, materialized)):
        raise ShootFlowCliError("package readiness lists are invalid")
    lines = [
        "ShootFlow package handoff brief",
        f"Shoot: {brief['shoot_slug']}",
        f"Status: {status}",
        f"Package jobs: {readiness['package_job_count']}",
        f"Completed: {len(completed)}",
        f"Review required: {len(review_required)}",
        f"Materialized outputs: {len(materialized)}",
        "",
        "Outputs:",
    ]
    lines.extend(f"- {output}" for output in materialized)
    if not materialized:
        lines.append("- none")
    lines.extend(
        [
            "",
            "Safety:",
            "- observe-only presentation; native file-changing controls remain disabled",
            "- no copy, retry, materialization, cleanup, overwrite, or deletion authority",
        ]
    )
    return "\n".join(lines) + "\n"


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


def _run_pilot_dashboard_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    summary = build_pilot_dashboard_summary(
        args.workspace,
        generated_at=args.generated_at,
    )
    stdout.write(_pilot_dashboard_summary_json(summary))


def _run_pilot_cohort_report_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    report = build_pilot_cohort_report_from_paths(
        args.dashboard_json,
        generated_at=args.generated_at,
    )
    stdout.write(_pilot_cohort_report_json(report))


def _run_pilot_cohort_brief_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    brief = build_pilot_cohort_brief_from_report_path(args.cohort_report)
    if args.format == "text":
        stdout.write(pilot_cohort_brief_to_text(brief))
    else:
        stdout.write(_pilot_cohort_brief_json(brief))


def _run_inspect_render_workspace_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    report = inspect_render_workspace(args.workspace)
    stdout.write(_render_workspace_report_json(report))


def _run_cull_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    result = cull_folder(args.folder, recursive=args.recursive)
    if args.write_xmp:
        result = write_sidecars(result)
    score = score_against_picks(result, read_picks(args.picks)) if args.picks else None
    thumbs = thumbnail_data_uris(result) if args.thumbs else None
    json_path, html_path = write_report(result, args.out, score, thumbs)
    out = {"summary": result_to_dict(result)["summary"], "report_json": str(json_path), "report_html": str(html_path)}
    if score:
        out["against_your_picks"] = pick_score_to_dict(score)
    stdout.write(json.dumps(out, sort_keys=True) + "\n")


def _run_create_demo_workspace_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    demo = create_persisted_cli_demo_workspace(
        args.workspace,
        shoot_slug=args.shoot_slug,
    )
    stdout.write(_demo_workspace_json(demo))


def _run_create_card_dump_demo_workspace_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    demo = create_card_dump_cli_demo_workspace(
        args.workspace,
        shoot_date=args.shoot_date,
        shoot_slug=args.shoot_slug,
        destination_subfolder=args.destination_subfolder,
    )
    stdout.write(_card_dump_demo_workspace_json(demo))


def _run_create_pilot_cohort_demo_command(args: argparse.Namespace, *, stdout: TextIO) -> None:
    demo = create_pilot_cohort_cli_demo_workspace(
        args.workspace,
        workspace_count=args.workspace_count,
        dashboard_generated_at=args.dashboard_generated_at,
        generated_at=args.generated_at,
    )
    stdout.write(_pilot_cohort_demo_workspace_json(demo))


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
    plan_import_route.add_argument(
        "--volume-metadata-json",
        help="Optional strict JSON file from native volume discovery with per-volume metadata overrides.",
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

    production_status = subparsers.add_parser(
        "init-production-status",
        help="Create production_status.json from a trusted ingest manifest if missing.",
    )
    production_status.add_argument(
        "--ingest-manifest",
        required=True,
        help="Path to the shoot ingest_manifest.json written by execute-ingest.",
    )

    production_scheduler = subparsers.add_parser(
        "dry-run-production-scheduler",
        help="Run trusted local production adapters against production_status.json.",
    )
    production_scheduler.add_argument(
        "--ingest-manifest",
        required=True,
        help="Path to the shoot ingest_manifest.json next to production_status.json.",
    )
    production_scheduler.add_argument(
        "--worker",
        required=True,
        help=(
            "Production worker adapter name, such as dry-run-production-local, "
            "metadata-production-local, proxy-production-local, "
            "analysis-production-local, scene-production-local, or "
            "look-production-local, grade-production-local, or "
            "story-production-local, or package-production-local."
        ),
    )
    production_scheduler.add_argument("--started-at", required=True, help="ISO-like timestamp for worker claims.")
    production_scheduler.add_argument("--completed-at", required=True, help="ISO-like timestamp for worker results.")
    production_scheduler.add_argument("--generated-at", required=True, help="ISO-like timestamp for the scheduler report.")
    production_scheduler.add_argument("--max-concurrency", type=int, default=1)
    production_scheduler.add_argument("--max-iterations", type=int, default=1)
    production_scheduler.add_argument("--stale-before")
    production_scheduler.add_argument("--lease-updated-at")
    production_scheduler.add_argument(
        "--retryable-job",
        action="append",
        default=[],
        help="Previously retryable production job ID that has been reviewed and may be retried.",
    )
    production_scheduler.add_argument(
        "--print-report",
        action="store_true",
        help="Print the persisted production scheduler report JSON to stdout.",
    )

    local_pipeline = subparsers.add_parser(
        "run-local-pipeline",
        help=(
            "Run every local stage (ffmpeg proxies, analysis, grading, story, ffmpeg render) "
            "unattended for one or more ingested shoots."
        ),
    )
    local_pipeline.add_argument(
        "--ingest-manifest",
        action="append",
        required=True,
        help="Shoot ingest_manifest.json. Repeat to queue several shoots.",
    )
    local_pipeline.add_argument(
        "--max-concurrency",
        type=int,
        default=2,
        help="ffmpeg jobs to run side by side (2-4 suits most Macs).",
    )
    local_pipeline.add_argument("--max-iterations", type=int, default=10)
    local_pipeline.add_argument(
        "--retry-retryable",
        action="store_true",
        help="Retry production jobs left retryable by an earlier run (after you have reviewed them).",
    )

    launchd = subparsers.add_parser(
        "write-launchd-plist",
        help="Print or write a macOS LaunchAgent that runs run-local-pipeline nightly.",
    )
    launchd.add_argument("--ingest-manifest", action="append", required=True)
    launchd.add_argument("--hour", type=int, default=1)
    launchd.add_argument("--minute", type=int, default=30)
    launchd.add_argument("--max-concurrency", type=int, default=2)
    launchd.add_argument(
        "--log",
        default="~/Library/Logs/shootflow-local-pipeline.log",
        help="File that receives the nightly run's JSON summary and errors.",
    )
    launchd.add_argument(
        "--output",
        help="Write the plist here (for example ~/Library/LaunchAgents/dev.shootflow.local-pipeline.plist).",
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
    next_wave.add_argument(
        "--use-production-status",
        action="store_true",
        help="Read completed production jobs from production_status.json next to the ingest manifest.",
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
    card_dump.add_argument(
        "--volume-metadata-json",
        help="Optional strict JSON file from native volume discovery with per-volume metadata overrides.",
    )

    handoff_controls = subparsers.add_parser(
        "handoff-controls",
        help="Validate observe-only handoff JSON and print disabled native controls.",
    )
    handoff_controls.add_argument(
        "--handoff-json",
        required=True,
        help="Path to a saved ShootFlow JSON handoff containing root workflow_authority.",
    )
    handoff_controls.add_argument(
        "--field-label",
        default="handoff",
        help="Label used in validation errors. Defaults to handoff.",
    )

    package_brief = subparsers.add_parser(
        "package-handoff-brief",
        help="Summarize package scheduler readiness and disabled native controls.",
    )
    package_brief.add_argument(
        "--ingest-manifest",
        required=True,
        help="Trusted ingest_manifest.json whose workspace contains production status/report files.",
    )
    package_brief.add_argument(
        "--format",
        choices=("json", "text"),
        default="json",
        help="Output format. Defaults to machine-readable JSON.",
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

    dashboard = subparsers.add_parser(
        "pilot-dashboard",
        help="Build a read-only pilot metrics dashboard from trusted workspace health.",
    )
    dashboard.add_argument(
        "--workspace",
        default=".",
        help="Shoot workspace containing ShootFlow handoff artifacts.",
    )
    dashboard.add_argument(
        "--generated-at",
        required=True,
        help="Caller-supplied timestamp for the read-only pilot dashboard.",
    )

    cohort_report = subparsers.add_parser(
        "pilot-cohort-report",
        help="Aggregate saved pilot-dashboard JSON payloads into read-only cohort metrics.",
    )
    cohort_report.add_argument(
        "--dashboard-json",
        action="append",
        required=True,
        help="Path to a saved pilot-dashboard JSON payload. Repeat for each workspace.",
    )
    cohort_report.add_argument(
        "--generated-at",
        required=True,
        help="Caller-supplied timestamp for the read-only cohort report.",
    )

    cohort_brief = subparsers.add_parser(
        "pilot-cohort-brief",
        help="Build an observe-only UI brief from a saved pilot-cohort-report JSON payload.",
    )
    cohort_brief.add_argument(
        "--cohort-report",
        required=True,
        help="Path to a saved pilot-cohort-report JSON payload.",
    )
    cohort_brief.add_argument(
        "--format",
        choices=("json", "text"),
        default="json",
        help="Output format. Defaults to json for existing integrations.",
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

    cull = subparsers.add_parser(
        "cull",
        help="Group near-identical photos, pick a keeper per group and flag rejects (read-only on photos).",
    )
    cull.add_argument("folder", help="Folder of photos (JPEG, PNG, TIFF, RAW with embedded preview).")
    cull.add_argument("--out", required=True, help="Folder for cull_report.json and cull_report.html.")
    cull.add_argument("--recursive", action="store_true", help="Include sub-folders.")
    cull.add_argument(
        "--write-xmp",
        action="store_true",
        help="Write Lightroom/Bridge .xmp rating sidecars (keeper 4, alternate 2, reject -1); never overwrites one.",
    )

    cull.add_argument(
        "--thumbs",
        action="store_true",
        help="Embed small thumbnails in cull_report.html as a contact sheet by burst (the file stays on your machine).",
    )
    cull.add_argument(
        "--picks",
        help="Text file of the photos you would keep (one name or path per line); the report scores the cull against it.",
    )

    create_demo = subparsers.add_parser(
        "create-demo-workspace",
        help="Create a tiny persisted render-task workspace for CLI and native-shell demos.",
    )
    create_demo.add_argument(
        "--workspace",
        default=".",
        help="Workspace where placeholder inputs and deliverables/render_tasks.json will be created.",
    )
    create_demo.add_argument(
        "--shoot-slug",
        default="cli-demo-shoot",
        help="Shoot slug to embed in the demo render-task manifest.",
    )

    card_dump_demo = subparsers.add_parser(
        "create-card-dump-demo-workspace",
        help="Create a safe synthetic card-dump workspace seeded for init/scheduler smoke demos.",
    )
    card_dump_demo.add_argument(
        "--workspace",
        default=".",
        help="Directory where the synthetic Volumes/ card and SSD demo tree will be created.",
    )
    card_dump_demo.add_argument(
        "--shoot-date",
        default="2026-05-08",
        help="ISO-8601 shoot date used by the synthetic ingest demo.",
    )
    card_dump_demo.add_argument(
        "--shoot-slug",
        default="cli-demo-shoot",
        help="Slug for the synthetic shoot folder. Must match ^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$.",
    )
    card_dump_demo.add_argument(
        "--destination-subfolder",
        default="ShootFlow",
        help="Relative library folder inside the synthetic destination volume.",
    )

    pilot_cohort_demo = subparsers.add_parser(
        "create-pilot-cohort-demo",
        help="Create saved pilot dashboards and a cohort report from trusted demo workspaces.",
    )
    pilot_cohort_demo.add_argument(
        "--workspace",
        default=".",
        help="Directory where the pilot cohort demo fixture will be created.",
    )
    pilot_cohort_demo.add_argument(
        "--workspace-count",
        type=int,
        default=2,
        help="Number of trusted demo shoot workspaces to create and aggregate.",
    )
    pilot_cohort_demo.add_argument(
        "--dashboard-generated-at",
        required=True,
        help="Caller-supplied timestamp for each saved pilot dashboard JSON payload.",
    )
    pilot_cohort_demo.add_argument(
        "--generated-at",
        required=True,
        help="Caller-supplied timestamp for the saved pilot cohort report.",
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


def _production_status_initialization_json(result: object) -> str:
    if not isinstance(result, ProductionStatusInitializationResult):
        raise ShootFlowCliError("result must be a ProductionStatusInitializationResult")
    return json.dumps(
        {
            "created": result.created,
            "status_path": str(result.manifest_path),
            "shoot_slug": result.manifest.shoot_slug,
            "production_plan_fingerprint": result.manifest.production_plan_fingerprint,
            "job_count": len(result.manifest.job_statuses),
            "pending_job_count": _production_status_count(result, "pending"),
            "running_job_count": _production_status_count(result, "running"),
            "succeeded_job_count": _production_status_count(result, "succeeded"),
            "failed_job_count": _production_status_count(result, "failed"),
            "retryable_job_count": _production_status_count(result, "retryable"),
            "notes": [
                "production status is bound to the verified ingest manifest and deterministic production plan",
                "initialization never resets an existing matching production_status.json",
                "no analysis, grading, render, deliverable, deletion, or cleanup files were written",
            ],
        },
        ensure_ascii=True,
        sort_keys=True,
    )


def _production_status_count(result: object, state: str) -> int:
    if not isinstance(result, ProductionStatusInitializationResult):
        raise ShootFlowCliError("result must be a ProductionStatusInitializationResult")
    return sum(1 for status in result.manifest.job_statuses if status.state == state)


def _dry_run_production_scheduler_summary_json(
    report: DryRunProductionSchedulerReport,
    *,
    ingest_manifest_path: Path,
    workspace: Path,
    report_path: Path,
) -> str:
    if not isinstance(report, DryRunProductionSchedulerReport):
        raise ShootFlowCliError("report must be a DryRunProductionSchedulerReport")
    payload = {
        "schema_version": 1,
        "workspace": str(workspace),
        "ingest_manifest_path": str(ingest_manifest_path),
        "report_path": str(report_path),
        "shoot_slug": report.shoot_slug,
        "worker_adapter": report.worker_adapter,
        "stopped_reason": report.stopped_reason,
        "iteration_count": report.iteration_count,
        "completed_job_ids": list(report.completed_job_ids),
        "retryable_job_ids": list(report.retryable_job_ids),
        "failed_job_ids": list(report.failed_job_ids),
        "blocked_job_ids": list(report.blocked_job_ids),
        "attempted_job_ids": list(report.attempted_job_ids),
        "skipped_retryable_job_ids": list(report.skipped_retryable_job_ids),
        "expired_lease_job_ids": list(report.expired_lease_job_ids),
        "conflicted_lease_job_ids": list(report.conflicted_lease_job_ids),
        "review_required_job_ids": list(report.review_required_job_ids),
        "outputs_materialized": list(report.outputs_materialized),
        "product_metrics": dict(report.product_metrics),
        "failure_messages": [
            {"job_id": message.job_id, "message": message.message}
            for message in report.failure_messages
        ],
        "notes": [
            "dry-run production scheduler consumes only trusted production_status.json and the verified ingest manifest",
            "previously retryable jobs require review and --retryable-job before another scheduler attempt",
            "new retryable, failed, or blocked jobs require review before another scheduler attempt",
            "no source media, graded media, render outputs, or deliverables were deleted",
        ],
    }
    return json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n"


def _ordered_unique_strings(values: tuple[str, ...]) -> tuple[str, ...]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return tuple(ordered)


def _production_scheduler_report_json(report: DryRunProductionSchedulerReport) -> str:
    if not isinstance(report, DryRunProductionSchedulerReport):
        raise ShootFlowCliError("report must be a DryRunProductionSchedulerReport")
    return json.dumps(
        {
            "schema_version": _SCHEDULER_REPORT_SCHEMA_VERSION,
            "workflow_authority": dict(report.workflow_authority),
            "generated_at": report.generated_at,
            "shoot_slug": report.shoot_slug,
            "production_plan_fingerprint": report.production_plan_fingerprint,
            "production_status_fingerprint": report.production_status_fingerprint,
            "worker_adapter": report.worker_adapter,
            "stopped_reason": report.stopped_reason,
            "iteration_count": report.iteration_count,
            "total_job_count": report.total_job_count,
            "completed_job_ids": list(report.completed_job_ids),
            "retryable_job_ids": list(report.retryable_job_ids),
            "failed_job_ids": list(report.failed_job_ids),
            "blocked_job_ids": list(report.blocked_job_ids),
            "attempted_job_ids": list(report.attempted_job_ids),
            "skipped_retryable_job_ids": list(report.skipped_retryable_job_ids),
            "expired_lease_job_ids": list(report.expired_lease_job_ids),
            "conflicted_lease_job_ids": list(report.conflicted_lease_job_ids),
            "review_required_job_ids": list(report.review_required_job_ids),
            "outputs_materialized": list(report.outputs_materialized),
            "product_metrics": dict(report.product_metrics),
            "failure_messages": [
                {"job_id": message.job_id, "message": message.message}
                for message in report.failure_messages
            ],
        },
        ensure_ascii=True,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _scheduler_report_json(report: DryRunRenderSchedulerReport) -> str:
    if not isinstance(report, DryRunRenderSchedulerReport):
        raise ShootFlowCliError("report must be a DryRunRenderSchedulerReport")
    return json.dumps(
        {
            "schema_version": _SCHEDULER_REPORT_SCHEMA_VERSION,
            "workflow_authority": dict(report.workflow_authority),
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
            "product_metrics": dict(report.product_metrics),
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
        "schema_version": _CLI_HANDOFF_SCHEMA_VERSION,
        "workflow_authority": observe_only_workflow_authority_to_dict(),
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


def _load_handoff_controls_payload(path: Path) -> dict[object, object]:
    if path.is_symlink():
        raise ShootFlowCliError(f"Refusing handoff JSON symlink: {path}")
    if not path.is_file():
        raise FileNotFoundError(path)
    try:
        raw_text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ShootFlowCliError(f"Unable to read handoff JSON: {path}") from exc
    try:
        raw_data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ShootFlowCliError(f"Invalid handoff JSON: {path}") from exc
    if not isinstance(raw_data, dict):
        raise ShootFlowCliError("Handoff JSON root must be an object")
    return raw_data


def _handoff_controls_json(*, handoff_path: Path, controls: dict[str, bool]) -> str:
    payload = {
        "schema_version": _CLI_HANDOFF_SCHEMA_VERSION,
        "workflow_authority": observe_only_workflow_authority_to_dict(),
        "handoff_path": str(handoff_path),
        "handoff_controls": dict(controls),
    }
    return json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True)


def _package_handoff_brief_json(
    report: DryRunProductionSchedulerReport,
    *,
    trusted_plan: ProductionPlan,
    final_manifest: ProductionStatusManifest,
    ingest_manifest_path: Path,
    workspace: Path,
) -> str:
    if not isinstance(report, DryRunProductionSchedulerReport):
        raise ShootFlowCliError("report must be a DryRunProductionSchedulerReport")
    if not isinstance(trusted_plan, ProductionPlan):
        raise ShootFlowCliError("trusted_plan must be a ProductionPlan")
    if not isinstance(final_manifest, ProductionStatusManifest):
        raise ShootFlowCliError("final_manifest must be a ProductionStatusManifest")
    if not isinstance(ingest_manifest_path, Path):
        raise ShootFlowCliError("ingest_manifest_path must be a Path")
    if not isinstance(workspace, Path):
        raise ShootFlowCliError("workspace must be a Path")
    package_jobs = tuple(
        job for job in trusted_plan.jobs if job.output_kind in _PACKAGE_OUTPUT_KINDS
    )
    package_job_ids = tuple(job.job_id for job in package_jobs)
    package_outputs = frozenset(output for job in package_jobs for output in job.outputs)
    statuses_by_id = {status.job_id: status for status in final_manifest.job_statuses}
    completed_package_job_ids = tuple(
        job_id
        for job_id in package_job_ids
        if statuses_by_id[job_id].state == "succeeded"
    )
    review_required_package_job_ids = tuple(
        job_id for job_id in package_job_ids if job_id in report.review_required_job_ids
    )
    materialized_package_outputs = tuple(
        checksum.path
        for job_id in package_job_ids
        if statuses_by_id[job_id].state == "succeeded"
        for checksum in statuses_by_id[job_id].output_checksums
        if checksum.path in package_outputs
    )
    controls = observe_only_handoff_controls_to_dict(
        {"workflow_authority": dict(report.workflow_authority)},
        field_label="production_scheduler_report",
    )
    payload = {
        "schema_version": _CLI_HANDOFF_SCHEMA_VERSION,
        "workflow_authority": observe_only_workflow_authority_to_dict(),
        "workspace": str(workspace),
        "ingest_manifest_path": str(ingest_manifest_path),
        "production_scheduler_report_path": str(
            workspace / PRODUCTION_SCHEDULER_REPORT_PATH
        ),
        "shoot_slug": report.shoot_slug,
        "worker_adapter": report.worker_adapter,
        "stopped_reason": report.stopped_reason,
        "handoff_controls": controls,
        "package_readiness": {
            "status": _package_readiness_status(
                package_job_count=len(package_job_ids),
                completed_package_count=len(completed_package_job_ids),
                review_required_package_count=len(review_required_package_job_ids),
                materialized_package_count=len(materialized_package_outputs),
            ),
            "package_job_count": len(package_job_ids),
            "completed_package_job_ids": list(completed_package_job_ids),
            "review_required_package_job_ids": list(review_required_package_job_ids),
            "materialized_package_outputs": list(materialized_package_outputs),
        },
        "notes": (
            "read-only package handoff brief; workflow_authority from the trusted "
            "scheduler report is used to keep native copy/retry/materialization "
            "controls disabled"
        ),
    }
    return json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n"


def _package_readiness_status(
    *,
    package_job_count: int,
    completed_package_count: int,
    review_required_package_count: int,
    materialized_package_count: int,
) -> str:
    if package_job_count == 0:
        return "not_applicable"
    if review_required_package_count:
        return "review_required"
    if (
        completed_package_count == package_job_count
        and materialized_package_count > 0
    ):
        return "ready"
    return "not_ready"


def _parse_volume_roots(raw_roots: Sequence[str]) -> list[Path]:
    roots: list[Path] = []
    for raw_root in raw_roots:
        if not isinstance(raw_root, str) or not raw_root.strip():
            raise ShootFlowCliError("volume roots must be non-empty strings")
        roots.append(Path(raw_root))
    return roots


def _load_volume_metadata_json(raw_path: str | None) -> dict[Path, VolumeDiscoveryHint] | None:
    if raw_path is None:
        return None
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise ShootFlowCliError("volume metadata path must be a non-empty string")
    path = Path(raw_path)
    if path.is_symlink():
        raise ShootFlowCliError(f"Refusing volume metadata symlink: {path}")
    if not path.is_file():
        raise FileNotFoundError(path)
    try:
        raw_data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ShootFlowCliError(f"Invalid volume metadata JSON: {path}") from exc
    if not isinstance(raw_data, dict):
        raise ShootFlowCliError("Volume metadata JSON root must be an object")
    raw_volumes = raw_data.get("volumes")
    if not isinstance(raw_volumes, list):
        raise ShootFlowCliError("Volume metadata JSON must contain a volumes list")

    volume_hints: dict[Path, VolumeDiscoveryHint] = {}
    for index, raw_volume in enumerate(raw_volumes):
        volume_path, hint = _volume_hint_from_json_entry(raw_volume, index=index)
        if volume_path in volume_hints:
            raise ShootFlowCliError(f"Duplicate volume metadata path: {volume_path}")
        volume_hints[volume_path] = hint
    return volume_hints


def _volume_hint_from_json_entry(
    raw_volume: object,
    *,
    index: int,
) -> tuple[Path, VolumeDiscoveryHint]:
    if not isinstance(raw_volume, dict):
        raise ShootFlowCliError(f"Volume metadata entry must be an object: {index}")
    allowed_fields = {
        "path",
        "name",
        "free_bytes",
        "total_bytes",
        "is_removable",
        "is_read_only",
    }
    unexpected_fields = tuple(sorted(str(key) for key in raw_volume if key not in allowed_fields))
    if unexpected_fields:
        raise ShootFlowCliError(f"Unexpected volume metadata field: {unexpected_fields[0]}")
    raw_path = raw_volume.get("path")
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise ShootFlowCliError(f"Volume metadata path must be a non-empty string: {index}")
    free_bytes = _optional_metadata_int(raw_volume, "free_bytes")
    total_bytes = _optional_metadata_int(raw_volume, "total_bytes")
    if free_bytes is not None and total_bytes is not None and free_bytes > total_bytes:
        raise ShootFlowCliError("free_bytes cannot exceed total_bytes")
    return Path(raw_path), VolumeDiscoveryHint(
        display_name=_optional_metadata_string(raw_volume, "name"),
        free_bytes=free_bytes,
        total_bytes=total_bytes,
        is_removable=_optional_metadata_bool(raw_volume, "is_removable"),
        is_read_only=_optional_metadata_bool(raw_volume, "is_read_only"),
    )


def _optional_metadata_string(raw_volume: dict[object, object], key: str) -> str | None:
    value = raw_volume.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ShootFlowCliError(f"{key} must be a non-empty string")
    return value


def _optional_metadata_int(raw_volume: dict[object, object], key: str) -> int | None:
    value = raw_volume.get(key)
    if value is None:
        return None
    if type(value) is not int:
        raise ShootFlowCliError(f"{key} must be an integer")
    if value < 0:
        raise ShootFlowCliError(f"{key} cannot be negative")
    return value


def _optional_metadata_bool(raw_volume: dict[object, object], key: str) -> bool | None:
    value = raw_volume.get(key)
    if value is None:
        return None
    if not isinstance(value, bool):
        raise ShootFlowCliError(f"{key} must be a boolean")
    return value


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
            "schema_version": _CLI_HANDOFF_SCHEMA_VERSION,
            "workflow_authority": observe_only_workflow_authority_to_dict(),
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
            "schema_version": _CLI_HANDOFF_SCHEMA_VERSION,
            "workflow_authority": observe_only_workflow_authority_to_dict(),
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
            "schema_version": _CLI_HANDOFF_SCHEMA_VERSION,
            "workflow_authority": observe_only_workflow_authority_to_dict(),
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
            "schema_version": _CLI_HANDOFF_SCHEMA_VERSION,
            "workflow_authority": observe_only_workflow_authority_to_dict(),
            "manifest_path": str(handoff.manifest_path),
            "workspace": str(handoff.workspace),
            "shoot_slug": handoff.shoot_slug,
            "status": handoff.status,
            "status_source": handoff.status_source,
            "wave_index": handoff.wave_index,
            "completed_job_ids": list(handoff.completed_job_ids),
            "blocked_dependency_ids": list(handoff.blocked_dependency_ids),
            "active_job_ids": list(handoff.active_job_ids),
            "review_required_job_ids": list(handoff.review_required_job_ids),
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
            "schema_version": _CLI_HANDOFF_SCHEMA_VERSION,
            "workflow_authority": observe_only_workflow_authority_to_dict(),
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
    return [
        {
            "name": "init_render_status",
            "workspace": str(workspace),
            "writes_files": True,
        },
        {
            "name": "run_dry_run_render_scheduler",
            "workspace": str(workspace),
            "completed_dependency_ids": _non_render_dependency_ids(plan),
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
            "schema_version": _CLI_HANDOFF_SCHEMA_VERSION,
            "workflow_authority": observe_only_workflow_authority_to_dict(),
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


def _pilot_dashboard_summary_json(summary: PilotDashboardSummary) -> str:
    if not isinstance(summary, PilotDashboardSummary):
        raise ShootFlowCliError("summary must be a PilotDashboardSummary")
    return (
        json.dumps(
            pilot_dashboard_summary_to_dict(summary),
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )


def _pilot_cohort_report_json(report: PilotCohortReport) -> str:
    if not isinstance(report, PilotCohortReport):
        raise ShootFlowCliError("report must be a PilotCohortReport")
    return (
        json.dumps(
            pilot_cohort_report_to_dict(report),
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )


def _pilot_cohort_brief_json(brief: PilotCohortBrief) -> str:
    if not isinstance(brief, PilotCohortBrief):
        raise ShootFlowCliError("brief must be a PilotCohortBrief")
    return (
        json.dumps(
            pilot_cohort_brief_to_dict(brief),
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
            "schema_version": _CLI_HANDOFF_SCHEMA_VERSION,
            "workflow_authority": observe_only_workflow_authority_to_dict(),
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


def _demo_workspace_json(demo: PersistedCliDemoWorkspace) -> str:
    if not isinstance(demo, PersistedCliDemoWorkspace):
        raise ShootFlowCliError("demo must be a PersistedCliDemoWorkspace")
    return json.dumps(
        {
            "schema_version": _CLI_HANDOFF_SCHEMA_VERSION,
            "workflow_authority": observe_only_workflow_authority_to_dict(),
            "workspace": str(demo.workspace_root),
            "render_tasks_manifest_path": str(demo.render_tasks_manifest_path),
            "shoot_slug": demo.trusted_plan.shoot_slug,
            "render_task_count": len(demo.trusted_plan.render_tasks),
            "required_completed_dependency_ids": list(demo.required_completed_dependency_ids),
            "expected_output_paths": list(demo.expected_output_paths),
            "safety_notes": list(demo.safety_notes),
            "next_steps": [
                "run init-render-status for this workspace before scheduling",
                "run dry-run-render-scheduler with each required_completed_dependency_id",
            ],
        },
        ensure_ascii=True,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _card_dump_demo_workspace_json(demo: CardDumpCliDemoWorkspace) -> str:
    if not isinstance(demo, CardDumpCliDemoWorkspace):
        raise ShootFlowCliError("demo must be a CardDumpCliDemoWorkspace")
    production_report = demo.card_dump_report.production_report
    if production_report is None:
        raise ShootFlowCliError("demo must include a production report")
    return json.dumps(
        {
            "schema_version": _CLI_HANDOFF_SCHEMA_VERSION,
            "workflow_authority": observe_only_workflow_authority_to_dict(),
            "workspace_root": str(demo.workspace_root),
            "volume_root": str(demo.volume_root),
            "source_volume": str(demo.source_volume),
            "destination_volume": str(demo.destination_volume),
            "shoot_folder": str(demo.shoot_folder),
            "render_tasks_manifest_path": str(demo.render_demo.render_tasks_manifest_path),
            "required_completed_dependency_ids": list(demo.required_completed_dependency_ids),
            "expected_output_paths": list(demo.expected_output_paths),
            "card_dump": {
                "status": demo.card_dump_report.status,
                "ingest_executed": demo.card_dump_report.ingest_executed,
                "manifest_path": (
                    None
                    if demo.card_dump_report.copy_report is None
                    else str(demo.card_dump_report.copy_report.manifest_path)
                ),
                "asset_counts": {
                    "photo": production_report.photo_asset_count,
                    "video": production_report.video_asset_count,
                    "total": production_report.photo_asset_count + production_report.video_asset_count,
                },
                "copied_manifest_item_count": production_report.copied_manifest_item_count,
                "wrote_downstream_files_before_demo_seed": False,
            },
            "safety_notes": list(demo.safety_notes),
            "next_steps": [
                "run init-render-status against shoot_folder before scheduling",
                "run dry-run-render-scheduler with each required_completed_dependency_id",
            ],
        },
        ensure_ascii=True,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _pilot_cohort_demo_workspace_json(demo: PilotCohortCliDemoWorkspace) -> str:
    if not isinstance(demo, PilotCohortCliDemoWorkspace):
        raise ShootFlowCliError("demo must be a PilotCohortCliDemoWorkspace")
    cohort_payload = pilot_cohort_report_to_dict(demo.cohort_report)
    return json.dumps(
        {
            "schema_version": _CLI_HANDOFF_SCHEMA_VERSION,
            "workflow_authority": observe_only_workflow_authority_to_dict(),
            "workspace": str(demo.workspace_root),
            "workspace_count": len(demo.shoot_workspaces),
            "shoot_workspaces": [str(path) for path in demo.shoot_workspaces],
            "dashboard_json_paths": [str(path) for path in demo.dashboard_json_paths],
            "cohort_report_path": str(demo.cohort_report_path),
            "cohort": cohort_payload["cohort"],
            "workspaces": cohort_payload["workspaces"],
            "safety_notes": list(demo.safety_notes),
            "next_steps": [
                "open the saved pilot dashboard JSON files for per-workspace readiness proof",
                "open the saved pilot cohort report for aggregate pilot readiness proof",
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
                "ingest_manifest_path": manifest_path,
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
