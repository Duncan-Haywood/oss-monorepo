"""Build a customer-facing diff from deterministic consent observations."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_observation(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    required = {"site", "captured_at", "browser", "region", "sequence", "requests", "storage"}
    missing = required - payload.keys()
    if missing:
        raise ValueError(f"observation missing fields: {', '.join(sorted(missing))}")
    return payload


def _index(items: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    return {(item["kind"], item["name"]): item for item in items}


def build_report(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    """Return an observation diff without making absence or legal claims."""
    # Before/after necessarily use different consent sequences; the site,
    # browser, and region are the comparability boundary.
    fields = ("site", "browser", "region")
    context = {field: after[field] for field in ("site", "browser", "region", "sequence")}
    if any(before[field] != after[field] for field in fields):
        return {"status": "unknown", "reason": "observation contexts differ", "context": context}

    changes: list[dict[str, Any]] = []
    for category in ("requests", "storage"):
        old, new = _index(before[category]), _index(after[category])
        for key in sorted(old.keys() | new.keys()):
            if key not in old:
                changes.append({"category": category, "kind": key[0], "name": key[1], "change": "added", "after": new[key]})
            elif key not in new:
                changes.append({"category": category, "kind": key[0], "name": key[1], "change": "removed", "before": old[key]})
            elif old[key] != new[key]:
                changes.append({"category": category, "kind": key[0], "name": key[1], "change": "changed", "before": old[key], "after": new[key]})

    return {
        "status": "observed",
        "context": context,
        "before_captured_at": before["captured_at"],
        "after_captured_at": after["captured_at"],
        "limitations": [
            "This is an observation from one browser, region, date, and sequence.",
            "Not observed is not proof of absent in every visitor context.",
            "This record is not a compliance grade or legal conclusion.",
        ],
        "changes": changes,
    }


def write_report(before_path: Path, after_path: Path, output_path: Path) -> None:
    report = build_report(load_observation(before_path), load_observation(after_path))
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    write_report(args.before, args.after, args.output)
