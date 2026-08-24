import argparse
import json
from pathlib import Path

from .report import build_report, load_snapshot, markdown_report


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare authorized public-register snapshots")
    parser.add_argument("--before", required=True, type=Path)
    parser.add_argument("--after", required=True, type=Path)
    parser.add_argument("--format", choices=("json", "markdown"), default="markdown")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--usage-file", type=Path, help="optional local aggregate event counter")
    args = parser.parse_args()
    report = build_report(load_snapshot(args.before), load_snapshot(args.after))
    output = markdown_report(report) if args.format == "markdown" else json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")
    if args.usage_file:
        usage = json.loads(args.usage_file.read_text(encoding="utf-8")) if args.usage_file.exists() and args.usage_file.stat().st_size else {}
        usage["snapshot_compared"] = int(usage.get("snapshot_compared", 0)) + 1
        args.usage_file.write_text(json.dumps(usage, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
