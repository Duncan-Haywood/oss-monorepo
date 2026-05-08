from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import TextIO

from shootflow.assembly import AssemblyPlanError, load_trusted_render_tasks_manifest
from shootflow.ingest import (
    CopyPlan,
    CopyReport,
    ImportSourceEstimate,
    IngestError,
    estimate_import_source,
    execute_copy_plan,
    plan_import,
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
from shootflow.storage import ImportRouteRecommendation, RankedStorageCandidate, StorageCandidate
from shootflow.storage_discovery import discover_import_route, discover_storage_candidates

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
        else:
            raise ShootFlowCliError(f"Unknown command: {args.command}")
    except (
        AssemblyPlanError,
        DryRunRenderSchedulerError,
        RenderStatusError,
        ShootFlowCliError,
        IngestError,
        FileNotFoundError,
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
