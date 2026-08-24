"""Build a provenance-preserving diff for a customer-selected public page."""

from __future__ import annotations

import difflib
import json
import sys
from pathlib import Path
from typing import Any


def load(path: str | Path) -> dict[str, Any]:
    with Path(path).open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError("snapshot must be an object")
    return value


def compare(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    if before.get("url") != after.get("url"):
        return {"status": "inconclusive", "reason": "source URL changed"}

    for snapshot in (before, after):
        if snapshot.get("fetch_status") != "ok":
            return {
                "status": "inconclusive",
                "reason": "fetch failed; absence of a diff is not evidence of stability",
            }

    old = str(before.get("text", ""))
    new = str(after.get("text", ""))
    changed = old != new
    return {
        "status": "changed" if changed else "unchanged",
        "url": after["url"],
        "section": after.get("section"),
        "before": {
            "fetched_at": before.get("fetched_at"),
            "http_status": before.get("http_status"),
            "text": old,
        },
        "after": {
            "fetched_at": after.get("fetched_at"),
            "http_status": after.get("http_status"),
            "text": new,
        },
        "diff": "".join(
            difflib.unified_diff(
                old.splitlines(keepends=True),
                new.splitlines(keepends=True),
                fromfile="before",
                tofile="after",
            )
        ),
        "boundary": "Source-linked evidence only; not legal advice or contract interpretation.",
    }


def main() -> int:
    if len(sys.argv) != 4:
        raise SystemExit("usage: watch.py BEFORE.json AFTER.json OUTPUT.json")
    report = compare(load(sys.argv[1]), load(sys.argv[2]))
    Path(sys.argv[3]).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
