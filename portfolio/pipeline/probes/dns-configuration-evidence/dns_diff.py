"""Compare two customer-authorized DNS observations without making claims."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from typing import Any

REQUIRED = {"domain", "captured_at", "resolver", "queries"}
INCONCLUSIVE = {"timeout", "disagreement", "dnssec_failure", "refused"}

def load_observation(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    missing = REQUIRED - payload.keys()
    if missing:
        raise ValueError(f"observation missing fields: {', '.join(sorted(missing))}")
    if not isinstance(payload["queries"], list):
        raise ValueError("observation queries must be a list")
    return payload

def _index(observation: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["type"]: item for item in observation["queries"]}

def compare(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    context = {"domain": after["domain"], "resolver": after["resolver"]}
    if any(before[field] != after[field] for field in context):
        return {"status": "inconclusive", "reason": "observation contexts differ", "context": context}
    states = {item.get("state") for item in before["queries"] + after["queries"]}
    if states & INCONCLUSIVE:
        return {"status": "inconclusive", "reason": "resolver observation contains an inconclusive state", "states": sorted(states & INCONCLUSIVE), "context": context}
    old, new = _index(before), _index(after)
    changes = []
    for query_type in sorted(old.keys() | new.keys()):
        if query_type not in old:
            changes.append({"type": query_type, "change": "added", "after": new[query_type]})
        elif query_type not in new:
            changes.append({"type": query_type, "change": "removed", "before": old[query_type]})
        elif old[query_type] != new[query_type]:
            changes.append({"type": query_type, "change": "changed", "before": old[query_type], "after": new[query_type]})
    return {"status": "observed", "context": {**context, "before_captured_at": before["captured_at"], "after_captured_at": after["captured_at"]}, "changes": changes, "limitations": ["This is one resolver observation, not a security, uptime, email-delivery, or compliance result.", "Caching, resolver location, split-horizon DNS, and transient failures can affect observations.", "The customer decides whether an observed change needs investigation."]}

def write_report(before_path: Path, after_path: Path, output_path: Path) -> None:
    output_path.write_text(json.dumps(compare(load_observation(before_path), load_observation(after_path)), indent=2, sort_keys=True) + "\n", encoding="utf-8")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path); parser.add_argument("after", type=Path); parser.add_argument("output", type=Path)
    args = parser.parse_args(); write_report(args.before, args.after, args.output)
