"""Command-line interface: record a backup run, and report on recorded runs."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from .report import build_history_report, markdown_report


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


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
        "log_tail": "\n".join((result.stdout + result.stderr).splitlines()[-args.log_lines :]),
    }
    if args.artifact:
        record["artifact"] = _stat_artifact(Path(args.artifact))
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


def cmd_check(args: argparse.Namespace) -> int:
    records = []
    for path in args.records:
        records.append(json.loads(path.read_text(encoding="utf-8")))
    report = build_history_report(records)
    output = markdown_report(report) if args.format == "markdown" else json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")
    if args.usage_file:
        _bump_usage(args.usage_file, "report_generated")
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
    record.add_argument("--output", type=Path, required=True, help="where to write the run-record JSON")
    record.add_argument("--usage-file", type=Path, help="optional local event-count file")
    record.add_argument("command", nargs=argparse.REMAINDER, help="-- the backup command to run")
    record.set_defaults(func=cmd_record)

    check = sub.add_parser("check", help="classify one or more saved run records")
    check.add_argument("records", nargs="+", type=Path)
    check.add_argument("--usage-file", type=Path, help="optional local event-count file")
    check.add_argument("--format", choices=("json", "markdown"), default="json")
    check.add_argument("--output", type=Path)
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
