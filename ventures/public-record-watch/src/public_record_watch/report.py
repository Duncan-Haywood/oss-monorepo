"""Offline, deterministic public-record snapshot comparison."""
from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def load_snapshot(path: str | Path) -> dict:
    snapshot = json.loads(Path(path).read_text(encoding="utf-8"))
    if snapshot.get("authorized") is not True:
        raise ValueError("input must declare authorized: true")
    if not snapshot.get("register") or not snapshot.get("source_url"):
        raise ValueError("input must include register and source_url")
    if not isinstance(snapshot["source_url"], str) or not re.match(r"^https?://", snapshot["source_url"]):
        raise ValueError("source_url must be an http(s) URL")
    records = snapshot.get("records")
    if not isinstance(records, list):
        raise ValueError("input must include a records list")
    seen = set()
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("id"), str) or not record["id"].strip():
            raise ValueError("each record must include an id")
        if record["id"] in seen:
            raise ValueError("snapshot contains duplicate record ids")
        seen.add(record["id"])
    return snapshot


def _record_value(record: dict) -> dict:
    return {key: record[key] for key in sorted(record) if key not in {"source_url"}}


def build_report(before: dict, after: dict) -> dict:
    if before["register"] != after["register"]:
        raise ValueError("snapshots must describe the same register")
    if before["source_url"] != after["source_url"]:
        raise ValueError("snapshots must use the same source_url")
    old = {item["id"]: item for item in before["records"]}
    new = {item["id"]: item for item in after["records"]}
    findings = []
    for record_id in sorted(set(old) | set(new)):
        previous, current = old.get(record_id), new.get(record_id)
        if previous is None:
            status = "added"
        elif current is None:
            status = "removed"
        elif _record_value(previous) != _record_value(current):
            status = "changed"
        else:
            status = "unchanged"
        record = current or previous
        findings.append({"id": record_id, "status": status, "record": record})
    return {
        "register": before["register"],
        "source_url": after["source_url"],
        "before_captured_at": before.get("captured_at"),
        "after_captured_at": after.get("captured_at"),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "finding_counts": dict(Counter(item["status"] for item in findings)),
        "findings": findings,
        "limitations": [
            "This reports differences between supplied snapshots; it does not establish that a register is complete or current.",
            "A source record is an observation, not a finding that a person is unsuitable, non-compliant, or unsafe.",
            "The customer must verify authorization, source accuracy, and any action before relying on this report.",
        ],
    }


def markdown_report(report: dict) -> str:
    def markdown_text(value: object) -> str:
        return str(value).replace("\\", "\\\\").replace("|", "\\|").replace("[", "\\[").replace("]", "\\]").replace("<", "&lt;").replace(">", "&gt;")

    counts = report["finding_counts"]
    source = markdown_text(report["source_url"])
    lines = [f"# Public-record changes: `{markdown_text(report['register'])}`", "", f"Source: {source}", "", "This is a source-linked observation record, not a suitability or compliance determination.", "", "## Summary", "", " · ".join(f"**{key}:** {counts.get(key, 0)}" for key in ("added", "removed", "changed", "unchanged")), "", "## Records", "", "| Record | Status | Source |", "|---|---|---|"]
    for finding in report["findings"]:
        lines.append(f"| `{markdown_text(finding['id'])}` | **{markdown_text(finding['status'])}** | {source} |")
    lines.extend(["", "## Limits", "", *[f"- {item}" for item in report["limitations"]], ""])
    return "\n".join(lines)
