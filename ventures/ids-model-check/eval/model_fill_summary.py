#!/usr/bin/env python3
"""Tally eval/model-fill-sweep.mjs and eval/model_fill_ifctester.py output.

    python3 eval/model_fill_summary.py OUT_ROOT

OUT_ROOT holds, per model, <model>/fill.jsonl and <model>.ifctester.jsonl
(the layout the commands in eval/model-fill-2026-11-21.md write).
"""
import json
import sys
from collections import Counter
from pathlib import Path


def main():
    root = Path(sys.argv[1])
    print("| Model | Mode | Pairs | Pairs with writes | Values written | Read back passing | Changed lines = edited + added records | Failing elements before | after |")
    print("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    sets = Counter()
    errors = []
    totals = Counter()
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        rows = [json.loads(l) for l in (d / "fill.jsonl").open()]
        for mode in ("ids", "table"):
            rs = [r for r in rows if r["mode"] == mode]
            ok = [r for r in rs if "error" not in r]
            errors += [(d.name, r["ids"], r["error"]) for r in rs if "error" in r]
            w = [r for r in ok if r["written"]]
            lines_ok = sum(1 for r in w if r["changedLines"] == r["editedRecords"] + r["addedRecords"])
            val = sum(r["written"] for r in w)
            back = sum(r["verified"]["pass"] for r in w)
            fb = sum(r["before"]["failing"] for r in ok)
            fa = sum(r["after"]["failing"] for r in ok)
            for r in w:
                for k, v in r["sets"].items():
                    sets[(mode, k)] += v
            totals[(mode, "values")] += val
            totals[(mode, "back")] += back
            totals[(mode, "pairs")] += len(w)
            print(f"| {d.name} | {mode} | {len(rs)} | {len(w)} | {val:,} | {back:,} | {lines_ok} of {len(w)} | {fb:,} | {fa:,} |")
    print()
    print("Sets:", {f"{m} {k}": v for (m, k), v in sorted(sets.items())})
    print("Read errors (the IDS could not be read):", sorted({(i, e) for _, i, e in errors}))
    print()
    print("| Model | Filled files | IfcTester refused the IDS | Opened by ifcopenshell | Values checked | Failed before | Pass after | Elements newly failing |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for f in sorted(root.glob("*.ifctester.jsonl")):
        rows = [json.loads(l) for l in f.open()]
        ran = [r for r in rows if "ids_refused" not in r]
        print(f"| {f.name.split('.')[0]} | {len(rows)} | {len(rows) - len(ran)} | {sum(1 for r in ran if r.get('opened'))} | "
              f"{sum(r.get('values_checked', 0) for r in ran):,} | {sum(r.get('failed_before', 0) for r in ran):,} | "
              f"{sum(r.get('pass_after', 0) for r in ran):,} | {sum(r.get('newly_failing', 0) for r in ran)} |")
        for r in ran:
            if not r.get("ok"):
                print("   not ok:", r)


if __name__ == "__main__":
    main()
