"""Command-line report generator."""

import argparse
import json
from pathlib import Path

from .report import build_report, load_snapshot, markdown_report


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare customer-authorized DNS snapshots")
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
    args = parser.parse_args()
    report = build_report(load_snapshot(args.before), load_snapshot(args.after))
    output = markdown_report(report) if args.format == "markdown" else json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")
    if args.usage_file:
        usage = json.loads(args.usage_file.read_text(encoding="utf-8")) if args.usage_file.exists() else {}
        usage["report_generated"] = int(usage.get("report_generated", 0)) + 1
        args.usage_file.write_text(json.dumps(usage, indent=2) + "\n", encoding="utf-8")
    if args.fail_on in report["finding_counts"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
