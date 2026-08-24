#!/usr/bin/env python3
"""Compare customer-authorized Shopify app inventory exports."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
import sys


REQUIRED = ("captured_at", "api_version", "source", "authorization_state", "apps")


def load_inventory(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read inventory: {exc}") from exc
    if not isinstance(data, dict) or any(key not in data for key in REQUIRED):
        raise ValueError("inventory must include captured_at, api_version, source, authorization_state, and apps")
    if not isinstance(data["apps"], list):
        raise ValueError("inventory apps must be a list")
    return data


def _mapping(inventory: dict) -> dict[str, dict]:
    result = {}
    for app in inventory["apps"]:
        if not isinstance(app, dict) or not isinstance(app.get("id"), str) or not app["id"]:
            raise ValueError("each app must have a non-empty string id")
        if app["id"] in result:
            raise ValueError(f"duplicate app id: {app['id']}")
        for field in ("scopes", "webhooks"):
            if not isinstance(app.get(field), list) or not all(isinstance(item, str) for item in app[field]):
                raise ValueError(f"app {app['id']} must contain a string {field} list")
        result[app["id"]] = app
    return result


def compare(before: dict, after: dict) -> dict:
    old, new = _mapping(before), _mapping(after)
    changes = []
    for app_id in sorted(set(old) | set(new)):
        if app_id not in old:
            changes.append({"app": app_id, "kind": "app_added"})
            continue
        if app_id not in new:
            changes.append({"app": app_id, "kind": "app_removed"})
            continue
        for field in ("scopes", "webhooks"):
            added = sorted(set(new[app_id][field]) - set(old[app_id][field]))
            removed = sorted(set(old[app_id][field]) - set(new[app_id][field]))
            if added or removed:
                changes.append({"app": app_id, "kind": f"{field}_changed", "added": added, "removed": removed})
    for field in ("authorization_state", "api_version"):
        if before[field] != after[field]:
            changes.append({"kind": f"{field}_changed", "before": before[field], "after": after[field]})
    metadata = {"before_source": before["source"], "after_source": after["source"], "before_captured_at": before["captured_at"], "after_captured_at": after["captured_at"]}
    return {"status": "changed" if changes else "unchanged", "metadata": metadata, "changes": changes, "review_required": bool(changes)}


def usage_event(path: Path, finding_count: int) -> None:
    event = {"event": "inventory_compared", "day": datetime.now(timezone.utc).date().isoformat(), "finding_count": finding_count}
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare two customer-authorized Shopify app inventory exports.")
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--usage-log", type=Path, help="opt-in aggregate event log")
    args = parser.parse_args()
    try:
        report = compare(load_inventory(args.before), load_inventory(args.after))
    except ValueError as exc:
        parser.error(str(exc))
    if args.usage_log:
        usage_event(args.usage_log, len(report["changes"]))
    if args.format == "json":
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(f"Status: {report['status']}")
        print("Review required: yes" if report["review_required"] else "Review required: no")
        for change in report["changes"]:
            print(f"- {change}")
        print("Evidence only: the merchant decides what each change means.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
