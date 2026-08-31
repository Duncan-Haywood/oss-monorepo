#!/usr/bin/env python3
"""Compare customer-supplied vendor policy snapshots without uploading them."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

REQUIRED = ("url", "captured_at", "fetch_status", "text")


def load_snapshot(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read snapshot: {exc}") from exc
    if not isinstance(value, dict) or any(key not in value for key in REQUIRED):
        raise ValueError("snapshot must include url, captured_at, fetch_status, and text")
    if not all(isinstance(value[key], str) and value[key].strip() for key in REQUIRED):
        raise ValueError("snapshot fields must be non-empty strings")
    try:
        datetime.fromisoformat(value["captured_at"].replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("captured_at must be an ISO 8601 timestamp") from exc
    return value


def compare(before: dict, after: dict) -> dict:
    before_time = datetime.fromisoformat(before["captured_at"].replace("Z", "+00:00"))
    after_time = datetime.fromisoformat(after["captured_at"].replace("Z", "+00:00"))
    metadata = {
        "url_before": before["url"], "url_after": after["url"],
        "captured_before": before["captured_at"], "captured_after": after["captured_at"],
        "fetch_status_before": before["fetch_status"], "fetch_status_after": after["fetch_status"],
    }
    changes = []
    if before["url"] != after["url"]:
        changes.append({"kind": "source_changed", "before": before["url"], "after": after["url"]})
    if before["fetch_status"] != "ok" or after["fetch_status"] != "ok":
        changes.append({"kind": "fetch_inconclusive", "before": before["fetch_status"], "after": after["fetch_status"]})
    if before["text"] != after["text"]:
        changes.append({"kind": "content_changed", "before_length": len(before["text"]), "after_length": len(after["text"])})
    if after_time < before_time:
        changes.append({"kind": "capture_order_invalid"})
    status = "inconclusive" if any(item["kind"] in ("fetch_inconclusive", "capture_order_invalid") for item in changes) else ("changed" if changes else "unchanged")
    return {"status": status, "metadata": metadata, "changes": changes, "review_required": bool(changes), "evidence_boundary": "Reports observations; the customer decides contractual or security significance."}


def write_usage(path: Path, event: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps({"event": event, "day": datetime.now(timezone.utc).date().isoformat()}, sort_keys=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare two local vendor policy snapshots.")
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("--format", choices=("text", "json", "markdown"), default="text")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--usage-log", type=Path, help="opt-in local aggregate event log")
    args = parser.parse_args()
    try:
        report = compare(load_snapshot(args.before), load_snapshot(args.after))
    except ValueError as exc:
        parser.error(str(exc))
    if args.output:
        args.output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.usage_log:
        write_usage(args.usage_log, "snapshot_compared")
    if args.format == "json":
        print(json.dumps(report, indent=2, sort_keys=True))
    elif args.format == "markdown":
        print(f"# Vendor snapshot review\n\n**Status:** `{report['status']}`\n\n**Review required:** {'yes' if report['review_required'] else 'no'}\n")
        for change in report["changes"]:
            print(f"- `{change['kind']}`")
        print("\n> Evidence only. Review the source and decide what action is appropriate.")
    else:
        print(f"Status: {report['status']}\nReview required: {'yes' if report['review_required'] else 'no'}")
        for change in report["changes"]:
            print(f"- {change['kind']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
