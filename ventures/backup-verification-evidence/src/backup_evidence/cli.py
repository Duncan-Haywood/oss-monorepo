"""Command-line interface: record a backup run, verify artifacts, report on runs."""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from .integrity import CORRUPT, INTACT, inspect_artifact
from .report import DEFAULT_SHRINK_RATIO, build_history_report, build_trend, markdown_report


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _positive_hours(value: str) -> float:
    hours = float(value)
    if not math.isfinite(hours) or hours < 0:
        raise argparse.ArgumentTypeError("must be a finite number zero or greater")
    return hours


def _stat_artifact(path: Path) -> dict:
    if not path.exists():
        return {"path": str(path), "exists": False}
    if path.is_dir():
        # A repository-style artifact (restic, borg): st_size on the directory
        # itself is inode metadata, not the backup's actual size, so sum the
        # files it contains and use the most recently touched one as modified_at.
        size_bytes = 0
        latest_mtime = path.stat().st_mtime
        for entry in path.rglob("*"):
            if entry.is_file():
                entry_stat = entry.stat()
                size_bytes += entry_stat.st_size
                latest_mtime = max(latest_mtime, entry_stat.st_mtime)
        modified_at = datetime.fromtimestamp(latest_mtime, tz=timezone.utc).isoformat(timespec="seconds")
        return {
            "path": str(path),
            "exists": True,
            "size_bytes": size_bytes,
            "modified_at": modified_at,
        }
    stat = path.stat()
    modified_at = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(timespec="seconds")
    return {
        "path": str(path),
        "exists": True,
        "size_bytes": stat.st_size,
        "modified_at": modified_at,
    }


def cmd_record(args: argparse.Namespace) -> int:
    """Run a backup command, observe its real exit code and artifact, and save a record."""
    started_at = _now_iso()
    start = time.monotonic()
    result = subprocess.run(args.command, shell=False, capture_output=True, text=True)
    duration_seconds = round(time.monotonic() - start, 3)
    finished_at = _now_iso()

    record = {
        "tool": args.tool,
        "command": args.command,
        "exit_code": result.returncode,
        "started_at": started_at,
        "finished_at": finished_at,
        "duration_seconds": duration_seconds,
    }
    # Backup output can contain paths, hostnames, or application data. Keep it
    # out of the durable evidence record unless the operator explicitly opts in.
    if args.include_log_tail:
        record["log_tail"] = "\n".join((result.stdout + result.stderr).splitlines()[-args.log_lines :])
    if args.artifact:
        record["artifact"] = _stat_artifact(Path(args.artifact))
        if args.verify_integrity and record["artifact"].get("exists"):
            record["artifact"]["integrity"] = inspect_artifact(
                Path(args.artifact), max_bytes=args.integrity_max_bytes
            )
    expected: dict = {}
    if args.max_age_hours is not None:
        expected["max_age_hours"] = args.max_age_hours
    if args.min_size_bytes is not None:
        expected["min_size_bytes"] = args.min_size_bytes
    if expected:
        record["expected"] = expected

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.output} (exit {result.returncode})", file=sys.stderr)
    if args.usage_file:
        _bump_usage(args.usage_file, "run_recorded")
    return result.returncode


# Exit codes for `verify`. Three states rather than two on purpose: an alerting
# rule wants to page loudly for a corrupt archive and quietly for one this tool
# cannot open, and collapsing those into a single nonzero would force the user
# to parse text to tell them apart.
VERIFY_EXIT_INTACT = 0
VERIFY_EXIT_CORRUPT = 1
VERIFY_EXIT_UNCHECKED = 2


def cmd_verify(args: argparse.Namespace) -> int:
    """Inspect artifacts that already exist, without wrapping a backup command.

    This is the shortest path to an answer: a user with a directory of nightly
    archives can point this at them and learn whether they are readable in one
    command, before deciding whether to wire `record` into their cron job.
    """
    results = []
    checked_at = datetime.now(timezone.utc)
    for path in args.artifacts:
        result = inspect_artifact(path, max_bytes=args.integrity_max_bytes)
        result["path"] = str(path)
        if args.max_age_hours is not None:
            modified_at = _stat_artifact(path).get("modified_at")
            if not modified_at:
                freshness = {"result": "unchecked", "detail": "artifact has no modification time to check"}
            else:
                modified = datetime.fromisoformat(modified_at)
                age_hours = (checked_at - modified).total_seconds() / 3600
                if age_hours < 0:
                    freshness = {"result": "clock_skew", "detail": f"artifact timestamp is {abs(age_hours):.1f}h in the future"}
                elif age_hours > args.max_age_hours:
                    freshness = {"result": "stale", "detail": f"artifact is {age_hours:.1f}h old (limit {args.max_age_hours:g}h)"}
                else:
                    freshness = {"result": "fresh", "age_hours": round(age_hours, 3)}
            result["freshness"] = freshness
            if freshness["result"] != "fresh":
                if result["result"] != CORRUPT:
                    result["result"] = "stale" if freshness["result"] == "stale" else "unchecked"
                result["detail"] += f"; freshness: {freshness['detail']}"
        results.append(result)

    payload = {"artifacts": results}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    if args.format == "json":
        print(json.dumps(payload, indent=2))
    else:
        for result in results:
            print(f"{result['result'].upper()}  {result['path']}  [{result['format']}]")
            print(f"    {result['detail']}")
        print(
            "\nIntact means the artifact read to its end with the format's own checksums "
            "matching. It does not mean the backup holds the right data, or that a restore "
            "will succeed -- test restores separately.",
            file=sys.stderr,
        )

    if args.usage_file:
        _bump_usage(args.usage_file, "artifact_verified")

    if any(result["result"] == CORRUPT for result in results):
        return VERIFY_EXIT_CORRUPT
    if all(result["result"] == INTACT for result in results):
        return VERIFY_EXIT_INTACT
    return VERIFY_EXIT_UNCHECKED


def cmd_check(args: argparse.Namespace) -> int:
    records = []
    for path in args.records:
        records.append(json.loads(path.read_text(encoding="utf-8")))
    report = build_history_report(records, require_integrity=args.require_integrity)
    if args.trend:
        report["trend"] = build_trend(records, shrink_ratio=args.shrink_ratio)
    output = markdown_report(report) if args.format == "markdown" else json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")
    if args.usage_file:
        _bump_usage(args.usage_file, "report_generated")
        if args.trend:
            _bump_usage(args.usage_file, "trend_viewed")
    latest = report.get("latest")
    return 0 if latest is None or latest["status"] == "verified" else 1


def _bump_usage(usage_file: Path, event: str) -> None:
    usage = json.loads(usage_file.read_text(encoding="utf-8")) if usage_file.exists() else {}
    usage[event] = int(usage.get(event, 0)) + 1
    usage_file.write_text(json.dumps(usage, indent=2) + "\n", encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="backup-evidence",
        description="Record and check evidence of whether a scheduled backup actually worked.",
    )
    sub = parser.add_subparsers(dest="subcommand", required=True)

    record = sub.add_parser("record", help="run a backup command and save an observed run record")
    record.add_argument("--tool", required=True, help="name of the backup tool being run")
    record.add_argument("--artifact", help="path to the file/directory the command is expected to produce")
    record.add_argument("--max-age-hours", type=float, default=None)
    record.add_argument("--min-size-bytes", type=int, default=None)
    record.add_argument("--log-lines", type=int, default=20)
    record.add_argument(
        "--include-log-tail",
        action="store_true",
        help="opt in to saving the command's final output lines in the local record",
    )
    record.add_argument(
        "--verify-integrity",
        action="store_true",
        help="also read the artifact end-to-end and record whether it is structurally intact",
    )
    record.add_argument(
        "--integrity-max-bytes",
        type=int,
        default=None,
        help="stop the integrity read after this many bytes and report it as inconclusive "
        "rather than intact (default: read the whole artifact)",
    )
    record.add_argument("--output", type=Path, required=True, help="where to write the run-record JSON")
    record.add_argument("--usage-file", type=Path, help="optional local event-count file")
    record.add_argument("command", nargs=argparse.REMAINDER, help="-- the backup command to run")
    record.set_defaults(func=cmd_record)

    verify = sub.add_parser(
        "verify",
        help="read existing backup artifacts and report whether each one is structurally intact",
        description="Inspect backup artifacts that already exist. Exits 0 if every artifact is "
        f"intact, {VERIFY_EXIT_CORRUPT} if any is provably corrupt, and "
        f"{VERIFY_EXIT_UNCHECKED} if none is corrupt but at least one could not be checked.",
    )
    verify.add_argument("artifacts", nargs="+", type=Path)
    verify.add_argument("--format", choices=("text", "json"), default="text")
    verify.add_argument("--integrity-max-bytes", type=int, default=None)
    verify.add_argument(
        "--output",
        type=Path,
        help="write the JSON evidence record to this local file (artifact paths and structural findings only)",
    )
    verify.add_argument(
        "--max-age-hours",
        type=_positive_hours,
        default=None,
        help="fail freshness checks when an artifact is older than this many hours",
    )
    verify.add_argument("--usage-file", type=Path, help="optional local event-count file")
    verify.set_defaults(func=cmd_verify)

    check = sub.add_parser("check", help="classify one or more saved run records")
    check.add_argument("records", nargs="+", type=Path)
    check.add_argument("--usage-file", type=Path, help="optional local event-count file")
    check.add_argument("--format", choices=("json", "markdown"), default="json")
    check.add_argument("--output", type=Path)
    check.add_argument(
        "--require-integrity",
        action="store_true",
        help="only treat a run as verified when the artifact was read end-to-end and found intact",
    )
    check.add_argument(
        "--trend",
        action="store_true",
        help="also compare consecutive nights for a shrinking artifact or a status regression",
    )
    check.add_argument(
        "--shrink-ratio",
        type=float,
        default=DEFAULT_SHRINK_RATIO,
        help="fractional drop versus the previous night or prior-night median that counts "
        f"as shrinking (default: {DEFAULT_SHRINK_RATIO})",
    )
    check.set_defaults(func=cmd_check)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.subcommand == "record" and args.command and args.command[0] == "--":
        args.command = args.command[1:]
    if args.subcommand == "record" and not args.command:
        parser.error("no command given to run -- e.g. backup-evidence record --tool restic --output run.json -- restic backup /data")
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
