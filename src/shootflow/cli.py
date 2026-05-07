from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import TextIO

from shootflow.assembly import AssemblyPlanError, load_trusted_render_tasks_manifest
from shootflow.render_scheduler import (
    DryRunRenderSchedulerError,
    DryRunRenderSchedulerReport,
    load_dry_run_render_scheduler_report,
    run_dry_run_render_scheduler,
    write_dry_run_render_scheduler_report,
)
from shootflow.render_status import RenderStatusError, load_render_status_manifest


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
        if args.command == "dry-run-render-scheduler":
            _run_dry_run_render_scheduler_command(args, stdout=out)
        else:
            raise ShootFlowCliError(f"Unknown command: {args.command}")
    except (
        AssemblyPlanError,
        DryRunRenderSchedulerError,
        RenderStatusError,
        ShootFlowCliError,
    ) as exc:
        print(f"shootflow: {exc}", file=err)
        return 1
    return 0


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


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="shootflow")
    subparsers = parser.add_subparsers(dest="command", required=True)

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
    return parser


def _scheduler_report_json(report: DryRunRenderSchedulerReport) -> str:
    if not isinstance(report, DryRunRenderSchedulerReport):
        raise ShootFlowCliError("report must be a DryRunRenderSchedulerReport")
    return json.dumps(
        {
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
