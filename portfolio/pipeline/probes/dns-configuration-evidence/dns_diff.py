"""Build a customer-facing DNS configuration diff from resolver snapshots.

Tests the `dns-configuration-evidence` candidate's narrowest claim: a pair of
multi-resolver DNS snapshots for a customer-authorized domain can produce a
source-linked, per-record-type change report, without a resolver timeout or
disagreement silently reading as "unchanged".

The candidate's stated boundary is explicit that resolver disagreement,
timeout, and provider refusal must be labeled inconclusive, never converted
to a change or a no-change. That is the one rule this module enforces before
it will compute any diff.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

OK = "ok"


def _same_rrsets(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """True when both maps name the same types with the same values per type.

    Resource-record order inside an RRset is not semantically meaningful, so
    per-type lists are compared after sorting. Key presence still matters:
    a type present on one side and absent on the other is a disagreement.
    """
    if left.keys() != right.keys():
        return False
    return all(sorted(left[key]) == sorted(right[key]) for key in left)


def load_snapshot(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    required = {"domain", "captured_at", "resolvers"}
    missing = required - payload.keys()
    if missing:
        raise ValueError(f"snapshot missing fields: {', '.join(sorted(missing))}")
    for resolver in payload["resolvers"]:
        resolver_required = {"resolver", "query_status"}
        resolver_missing = resolver_required - resolver.keys()
        if resolver_missing:
            raise ValueError(f"resolver entry missing fields: {', '.join(sorted(resolver_missing))}")
    return payload


def _consensus(side: dict[str, Any]) -> tuple[dict[str, list[str]] | None, str | None]:
    """Return (agreed records, None) or (None, reason) for one snapshot side.

    A side only has consensus records when every resolver in it returned
    `ok` and every `ok` resolver returned the same records. Anything else
    (a timeout, a refusal, a servfail, or resolvers disagreeing with each
    other) is a reason the side cannot be used, not a value to guess from.
    """
    ok_resolvers = [r for r in side["resolvers"] if r["query_status"] == OK]
    bad_resolvers = [r for r in side["resolvers"] if r["query_status"] != OK]

    if bad_resolvers:
        names = ", ".join(f"{r['resolver']} ({r['query_status']})" for r in bad_resolvers)
        return None, f"resolver(s) did not return ok: {names}"

    if not ok_resolvers:
        return None, "no resolver reported"

    reference = ok_resolvers[0]
    for other in ok_resolvers[1:]:
        if not _same_rrsets(other.get("records", {}), reference.get("records", {})):
            return None, f"resolvers disagree ({reference['resolver']} vs {other['resolver']})"

    return reference.get("records", {}), None


def build_report(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    """Return a record-type-level diff, or an inconclusive/unknown status."""
    if before["domain"] != after["domain"]:
        return {
            "status": "unknown",
            "reason": "snapshot domains differ",
            "before_domain": before["domain"],
            "after_domain": after["domain"],
        }

    before_records, before_reason = _consensus(before)
    after_records, after_reason = _consensus(after)

    if before_reason or after_reason:
        reasons = []
        if before_reason:
            reasons.append(f"before snapshot: {before_reason}")
        if after_reason:
            reasons.append(f"after snapshot: {after_reason}")
        return {
            "status": "inconclusive",
            "reason": "; ".join(reasons),
            "domain": before["domain"],
            "before_captured_at": before["captured_at"],
            "after_captured_at": after["captured_at"],
        }

    changes: list[dict[str, Any]] = []
    for record_type in sorted(set(before_records) | set(after_records)):
        old = before_records.get(record_type)
        new = after_records.get(record_type)
        if old is None:
            changes.append({"record_type": record_type, "change": "added", "after": new})
        elif new is None:
            changes.append({"record_type": record_type, "change": "removed", "before": old})
        elif sorted(old) != sorted(new):
            changes.append({"record_type": record_type, "change": "changed", "before": old, "after": new})

    return {
        "status": "observed",
        "domain": before["domain"],
        "before_captured_at": before["captured_at"],
        "after_captured_at": after["captured_at"],
        "changes": changes,
        "limitations": [
            "Reports only record types present in the queried set; it does not enumerate every "
            "possible DNS record type.",
            "Agreement across the snapshot's own resolvers is not a security, deliverability, or "
            "compliance claim.",
        ],
    }


def write_report(before_path: Path, after_path: Path, output_path: Path) -> None:
    report = build_report(load_snapshot(before_path), load_snapshot(after_path))
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    write_report(args.before, args.after, args.output)
