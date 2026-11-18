#!/usr/bin/env python3
"""Sets this checker's corpus run beside IfcTester's, specification by specification.

    python3 eval/corpus_crosscheck_compare.py OURS.jsonl THEIRS.jsonl [THEIRS.jsonl ...] [--detail]

A specification is "same" when the verdict, the applicable count and the set
of failing element ids all agree. A prohibited specification's failing list is
capped at 500 here (ids.mjs), so there the first 500 must be a subset of
IfcTester's. Pairs IfcTester could not open or run are counted apart.
"""
import json
import sys
from collections import Counter


def load(paths):
    rows = {}
    for p in paths:
        for line in open(p):
            r = json.loads(line)
            rows[(r["model"], r["ids"])] = r
    return rows


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    detail = "--detail" in sys.argv
    ours, theirs = load(args[:1]), load(args[1:])
    tally = Counter()
    per_model = {}
    diffs = []
    for key, t in sorted(theirs.items()):
        o = ours.get(key)
        pm = per_model.setdefault(key[0], Counter())
        if o is None:
            continue
        pm["pairs"] += 1
        if "open_error" in t or "error" in t:
            pm["ifctester_error"] += 1
            tally["ifctester_error:" + (t.get("open_error") or t.get("error"))[:80]] += 1
            continue
        if "error" in o:
            pm["ours_error"] += 1
            continue
        if len(o["specs"]) != len(t["specs"]):
            pm["spec_count_mismatch"] += 1
            diffs.append((key, "spec count", len(o["specs"]), len(t["specs"])))
            continue
        for a, b in zip(o["specs"], t["specs"]):
            fa, fb = set(a["failed"]), set(b["failed"])
            capped = len(fa) == 500 and len(fb) > 500 and fa <= fb
            same = a["pass"] == b["pass"] and a["applicable"] == b["applicable"] and (fa == fb or capped)
            pm["specs"] += 1
            pm["same" if same else "diff"] += 1
            if not same:
                diffs.append((key, b["name"], a, b))
    print("| Model | IDS files run by both | IfcTester could not run | Specifications compared | Identical | Different |")
    print("| --- | ---: | ---: | ---: | ---: | ---: |")
    for m, c in sorted(per_model.items()):
        print(f"| {m} | {c['pairs'] - c['ifctester_error'] - c['ours_error']} | {c['ifctester_error']} | {c['specs']} | {c['same']} | {c['diff']} |")
    for k, v in sorted(tally.items()):
        print(f"  {v} x {k}")
    print(f"\n{len(diffs)} differing specification results")
    for d in diffs if detail else diffs[:0]:
        key, name, a, b = d
        if isinstance(a, dict):
            fa, fb = set(a["failed"]), set(b["failed"])
            print(f"- {key[0]} / {key[1]} / {name}: ours {'pass' if a['pass'] else 'fail'} {a['applicable']} applicable {len(fa)} failing; "
                  f"IfcTester {'pass' if b['pass'] else 'fail'} {b['applicable']} applicable {len(fb)} failing; "
                  f"only ours {sorted(fa - fb)[:5]} ({len(fa - fb)}), only IfcTester {sorted(fb - fa)[:5]} ({len(fb - fa)})")
        else:
            print(f"- {key[0]} / {key[1]}: {name} ours {a} vs IfcTester {b}")


if __name__ == "__main__":
    main()
