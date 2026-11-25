#!/usr/bin/env python3
"""Groups the differences corpus_crosscheck_compare.py finds by (IDS file, specification).

    python3 eval/corpus_crosscheck_group.py OURS.jsonl THEIRS.jsonl [THEIRS.jsonl ...]

On a wide model set the same specification differs on many models for one
cause; this prints each (IDS, specification) once with the number of models
it differs on, our and IfcTester's verdicts and the status this checker gave
(``invalid`` means it refused the specification as written), so each group
can be traced to a cause once. Same "same" rule as the compare script.
Two causes are told apart mechanically: this checker refused the
specification (``invalid``), or the applicable counts differ by exactly the
subclass elements this checker reports as skipped (``skippedSubclasses``,
eval/corpus-crosscheck-2026-11-17.md cause 1). The rest say "trace by hand".
"""
import json
import sys
from collections import defaultdict


def load(paths):
    rows = {}
    for p in paths:
        for line in open(p):
            r = json.loads(line)
            rows[(r["model"], r["ids"])] = r
    return rows


def main():
    ours, theirs = load(sys.argv[1:2]), load(sys.argv[2:])
    groups = defaultdict(list)
    compared = 0
    for key, t in theirs.items():
        o = ours.get(key)
        if o is None or "error" in t or "open_error" in t or "error" in o or len(o["specs"]) != len(t["specs"]):
            continue
        for a, b in zip(o["specs"], t["specs"]):
            compared += 1
            fa, fb = set(a["failed"]), set(b["failed"])
            capped = len(fa) == 500 and len(fb) > 500 and fa <= fb
            if a["pass"] == b["pass"] and a["applicable"] == b["applicable"] and (fa == fb or capped):
                continue
            skipped = sum(x["count"] for x in (a.get("skipped") or []))
            if a.get("status") == "invalid":
                cause = "ours refuses the specification as written"
            elif a["applicable"] != b["applicable"] and a["applicable"] + skipped == b["applicable"]:
                cause = "subclasses the entity facet leaves out (ours warns, count matches)"
            else:
                cause = "other: trace by hand"
            verdicts = (
                f"ours {a.get('status') or ('pass' if a['pass'] else 'fail')}",
                f"IfcTester {'pass' if b['pass'] else 'fail'}",
                "same applicable" if a["applicable"] == b["applicable"] else "applicable differs",
            )
            groups[(key[1], b["name"], verdicts, cause)].append((key[0], a["applicable"], b["applicable"], len(fa ^ fb)))
    total = sum(len(v) for v in groups.values())
    print(f"{compared} specification results compared, {total} differ, in {len(groups)} groups")
    by_cause = defaultdict(lambda: [0, 0])
    for (_, _, _, cause), rows in groups.items():
        by_cause[cause][0] += 1
        by_cause[cause][1] += len(rows)
    for cause, (g, n) in sorted(by_cause.items(), key=lambda kv: -kv[1][1]):
        print(f"  {n} results in {g} groups: {cause}")
    print()
    print("| Models | IDS | Specification | Verdicts | Cause | Example model (ours / IfcTester applicable, failing ids that differ) |")
    print("| ---: | --- | --- | --- | --- | --- |")
    for (ids, name, verdicts, cause), rows in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        m, oa, ta, d = max(rows, key=lambda r: r[3] + abs(r[1] - r[2]))
        print(f"| {len(rows)} | {ids} | {name} | {', '.join(verdicts)} | {cause} | {m} ({oa} / {ta}, {d}) |")


if __name__ == "__main__":
    main()
