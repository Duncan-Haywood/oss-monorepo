"""Build a section-aware diff from a pair of vendor page snapshots.

A fetch failure on either side must read as `inconclusive`, never as
`unchanged` — a missing snapshot must not look like stability. A context
mismatch (different vendor or URL) reads as `unknown`, not "no change".
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

FETCH_OK = "ok"

REQUIRED_SNAPSHOT_FIELDS = {
    "vendor",
    "page_url",
    "page_type",
    "captured_at",
    "fetch_status",
    "sections",
}


def load_snapshot(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    missing = REQUIRED_SNAPSHOT_FIELDS - payload.keys()
    if missing:
        raise ValueError(f"snapshot missing fields: {', '.join(sorted(missing))}")
    return payload


def _normalize(text: str) -> str:
    """Collapse whitespace so a reflow or re-indent isn't read as a content change."""
    return re.sub(r"\s+", " ", text).strip()


def _index(sections: list[dict[str, str]]) -> dict[str, str]:
    return {section["heading"]: section["text"] for section in sections}


def build_report(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    """Return a section-level diff, or an inconclusive/unknown status."""
    identity_fields = ("vendor", "page_url", "page_type")
    context = {field: after[field] for field in identity_fields}

    if before["fetch_status"] != FETCH_OK or after["fetch_status"] != FETCH_OK:
        failed_side = "before" if before["fetch_status"] != FETCH_OK else "after"
        return {
            "status": "inconclusive",
            "reason": f"{failed_side} snapshot fetch did not succeed "
            f"({(before if failed_side == 'before' else after)['fetch_status']})",
            "context": context,
        }

    if any(before[field] != after[field] for field in identity_fields):
        return {"status": "unknown", "reason": "snapshot contexts differ", "context": context}

    old, new = _index(before["sections"]), _index(after["sections"])
    changes: list[dict[str, str]] = []
    for heading in sorted(old.keys() | new.keys()):
        if heading not in old:
            changes.append({"heading": heading, "change": "added", "after": new[heading]})
        elif heading not in new:
            changes.append({"heading": heading, "change": "removed", "before": old[heading]})
        elif _normalize(old[heading]) != _normalize(new[heading]):
            changes.append(
                {"heading": heading, "change": "changed", "before": old[heading], "after": new[heading]}
            )

    return {
        "status": "observed",
        "context": context,
        "source_url": after["page_url"],
        "before_captured_at": before["captured_at"],
        "after_captured_at": after["captured_at"],
        "limitations": [
            "This is a diff of one fetched snapshot pair, not a legal review.",
            "No change reported here is not proof the page never changed between captures.",
            "This record is not legal advice and does not assert compliance or non-compliance.",
        ],
        "changes": changes,
    }


def write_report(before_path: Path, after_path: Path, output_path: Path) -> None:
    report = build_report(load_snapshot(before_path), load_snapshot(after_path))
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
