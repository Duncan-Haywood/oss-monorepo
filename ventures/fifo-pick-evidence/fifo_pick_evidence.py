#!/usr/bin/env python3
"""Check a pick log for simple FIFO evidence gaps and exceptions."""

import argparse
import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

REQUIRED = ("order_id", "sku", "lot", "received_at", "picked_at")


def parse_time(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def check_rows(rows):
    observations = []
    by_sku = defaultdict(list)
    for number, row in enumerate(rows, 2):
        missing = [field for field in REQUIRED if not row.get(field, "").strip()]
        if missing:
            observations.append({"row": number, "kind": "missing-data", "fields": missing})
            continue
        try:
            received = parse_time(row["received_at"])
            picked = parse_time(row["picked_at"])
        except ValueError:
            observations.append({"row": number, "kind": "invalid-timestamp"})
            continue
        if picked < received:
            observations.append({"row": number, "kind": "time-order", "message": "picked_at precedes received_at"})
        by_sku[row["sku"]].append((number, row, received, picked))

    for sku, items in by_sku.items():
        for number, row, received, _ in items:
            earlier = [other for other in items if other[2] < received and other[3] > parse_time(row["picked_at"])]
            for other_number, other, _, _ in earlier:
                observations.append({
                    "row": number,
                    "kind": "fifo-exception",
                    "sku": sku,
                    "order_id": row["order_id"],
                    "older_row": other_number,
                    "older_order_id": other["order_id"],
                })
    return observations


def read_report(path):
    with Path(path).open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        # Read the header row from the reader itself, not from the first data
        # row. A pick log with headers but zero picks (nothing moved yet today,
        # or a filtered export) used to leave `rows` empty, so this fell back to
        # `[]` and reported every required column as missing -- blaming the file
        # for a problem it does not have and hiding the real, unremarkable
        # answer: no rows, no observations.
        fieldnames = reader.fieldnames or []
        rows = list(reader)
    missing_headers = [field for field in REQUIRED if field not in fieldnames]
    if missing_headers:
        raise ValueError("missing required columns: " + ", ".join(missing_headers))
    observations = check_rows(rows)
    return {"status": "observations" if observations else "no-observations", "rows_checked": len(rows), "observations": observations}


def record_usage(path):
    if not path:
        return
    target = Path(path).expanduser()
    data = {"events": 0}
    if target.exists():
        data = json.loads(target.read_text(encoding="utf-8"))
    data["events"] = int(data.get("events", 0)) + 1
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, sort_keys=True) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(
        description="Create a local FIFO pick-order evidence report from CSV.",
        epilog=(
            "No warranty. This tool is provided free and as-is, without warranty "
            "of any kind. It is not engineering, legal, tax, financial, or "
            "compliance advice. Review and verify every observation before "
            "relying on it. GitHub Sponsors is optional and never changes what "
            "the tool does: https://github.com/sponsors/Duncan-Haywood"
        ),
    )
    parser.add_argument("csv_file")
    parser.add_argument("--format", choices=("json", "text"), default="text")
    parser.add_argument("--usage-file", help="Optional local counter file; omit to disable usage counting.")
    args = parser.parse_args()
    try:
        report = read_report(args.csv_file)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    record_usage(args.usage_file)
    if args.format == "json":
        print(json.dumps(report, indent=2))
    else:
        print(f"{report['status']}: {report['rows_checked']} rows checked, {len(report['observations'])} observations")
        for item in report["observations"]:
            print("- " + json.dumps(item, sort_keys=True))
    return 1 if report["observations"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
