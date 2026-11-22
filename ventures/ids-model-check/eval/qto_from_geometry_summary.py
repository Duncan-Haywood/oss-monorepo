#!/usr/bin/env python3
"""Sums eval/model-fill-sweep.mjs --modes geometry runs: OUT_DIR/<model>/fill.jsonl.

    python3 eval/qto_from_geometry_summary.py OUT_DIR
"""
import json, sys
from pathlib import Path

print("| Model | Pairs | Pairs with measured values | Values written | measured from geometry | copied from the model | Read back passing | Changed lines = edited + added | Failing before | after | errors |")
print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
for d in sorted(Path(sys.argv[1]).iterdir()):
    f = d / "fill.jsonl"
    if not f.exists():
        continue
    rows = [json.loads(l) for l in f.read_text().splitlines() if l.strip()]
    ok = [r for r in rows if "error" not in r]
    geo = [r for r in ok if r.get("fromGeometry")]
    w = sum(r["written"] for r in ok)
    g = sum(r.get("fromGeometry", 0) for r in ok)
    m = sum(r.get("fromModel", 0) for r in ok)
    vp = sum(r["verified"]["pass"] for r in ok if r.get("verified"))
    lines_ok = sum(1 for r in ok if r["written"] and r["changedLines"] == r["editedRecords"] + r["addedRecords"])
    with_w = sum(1 for r in ok if r["written"])
    fb = sum(r["before"]["failing"] for r in ok)
    fa = sum(r["after"]["failing"] for r in ok if r.get("after")) + sum(r["before"]["failing"] for r in ok if not r.get("after"))
    print(f"| {d.name} | {len(rows)} | {len(geo)} | {w:,} | {g:,} | {m:,} | {vp:,} | {lines_ok} of {with_w} | {fb:,} | {fa:,} | {len(rows) - len(ok)} |")
