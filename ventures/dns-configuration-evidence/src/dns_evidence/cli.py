"""Command-line capture and comparison of customer-authorized DNS snapshots."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .capture import CaptureError, capture_snapshot, plan_from_cli, write_snapshot
from .report import build_report, load_snapshot, markdown_report


def _bump_usage(path: Path | None, event: str) -> None:
    if path is None:
        return
    usage = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    usage[event] = int(usage.get(event, 0)) + 1
    path.write_text(json.dumps(usage, indent=2) + "\n", encoding="utf-8")


def _add_compare_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--before", required=True, type=Path)
    parser.add_argument("--after", required=True, type=Path)
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--usage-file", type=Path, help="optional local event-count file")
    parser.add_argument(
        "--fail-on",
        choices=("never", "changed", "inconclusive"),
        default="never",
        help="return exit status 2 when the report includes this result (useful in CI)",
    )


def _add_capture_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--plan", type=Path, help="JSON plan with authorized, domain, queries, resolvers")
    parser.add_argument("--domain", help="customer-authorized apex domain (when not using --plan)")
    parser.add_argument(
        "--authorized",
        action="store_true",
        help="required when flags are used instead of a plan; the customer authorized this capture",
    )
    parser.add_argument(
        "--query",
        action="append",
        default=[],
        dest="queries",
        metavar="NAME:TYPE",
        help="name:TYPE to observe, repeatable (example: example.test:MX)",
    )
    parser.add_argument(
        "--resolver",
        action="append",
        default=[],
        dest="resolvers",
        metavar="ADDRESS",
        help="resolver address or hostname, repeatable (recorded as the observation identity)",
    )
    parser.add_argument("--timeout", type=float, default=3.0, help="per-query timeout in seconds (default 3)")
    parser.add_argument("--output", type=Path, help="write the snapshot JSON here instead of stdout")
    parser.add_argument("--usage-file", type=Path, help="optional local event-count file")
    parser.add_argument(
        "--fail-on",
        choices=("never", "timeout", "refused", "error"),
        default="never",
        help="return exit status 2 when any observation has this status",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Capture or compare customer-authorized DNS snapshots. "
            "This is observation evidence, not a security, deliverability, or compliance warranty."
        )
    )
    sub = parser.add_subparsers(dest="command")
    compare = sub.add_parser("compare", help="diff two authorized snapshots")
    _add_compare_args(compare)
    capture = sub.add_parser("capture", help="query named resolvers and write an authorized snapshot")
    _add_capture_args(capture)
    return parser


def run_compare(args: argparse.Namespace) -> int:
    report = build_report(load_snapshot(args.before), load_snapshot(args.after))
    output = markdown_report(report) if args.format == "markdown" else json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")
    _bump_usage(args.usage_file, "report_generated")
    if args.fail_on in report["finding_counts"]:
        return 2
    return 0


def run_capture(args: argparse.Namespace) -> int:
    try:
        plan = plan_from_cli(
            domain=args.domain,
            authorized=args.authorized,
            queries=args.queries,
            resolvers=args.resolvers,
            timeout=args.timeout,
            plan_path=args.plan,
        )
        snapshot = capture_snapshot(plan)
    except CaptureError as error:
        print(f"capture failed: {error}", file=sys.stderr)
        return 1
    output = json.dumps(snapshot, indent=2) + "\n"
    if args.output:
        write_snapshot(snapshot, args.output)
    else:
        print(output, end="")
    _bump_usage(args.usage_file, "snapshot_captured")
    if args.fail_on != "never" and any(item.get("status") == args.fail_on for item in snapshot["observations"]):
        return 2
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else list(argv)
    parser = build_parser()
    if not argv or argv[0] in ("-h", "--help"):
        parser.print_help()
        return 0
    if argv[0] == "capture":
        return run_capture(parser.parse_args(argv))
    if argv[0] == "compare":
        return run_compare(parser.parse_args(argv))
    # Legacy: python3 -m dns_evidence.cli --before a.json --after b.json
    compare = argparse.ArgumentParser(description="Compare customer-authorized DNS snapshots")
    _add_compare_args(compare)
    return run_compare(compare.parse_args(argv))


if __name__ == "__main__":
    raise SystemExit(main())
