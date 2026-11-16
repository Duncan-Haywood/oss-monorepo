"""Summarise eval/repair-reserve-1200.jsonl: the 2 s repair reserve (the default) against 1.2 s, four above-floor weeks, seeds 37-48,
and apply the decision rule fixed in eval/repair-reserve-1200-prereg.md.
   python3 eval/repair-reserve-1200-summary.py eval/repair-reserve-1200.jsonl > eval/repair-reserve-1200.out.txt"""
import json, sys
from math import comb
A, B = "flow2000", "flow1200"
by = {}
for l in open(sys.argv[1]):
    if l.startswith("{"):
        r = json.loads(l)
        by.setdefault((r["P"], r["S"], r["week"], r["seed"]), {})[r["cfg"]] = r
full = {k: d for k, d in by.items() if A in d and B in d}
print(f"== {len(full)} paired builds")
print("build (P S week seed) | floor | 2 s open | 1.2 s open | repair ms 2 s | repair ms 1.2 s | cover-pass ms 2 s | 1.2 s | gains 2 s | 1.2 s")
g = lambda d, c: ((d[c].get("repair") or {}).get("gains", "-"))
for k in sorted(full):
    d = full[k]
    print(f"{k} | {d[A]['floor']} | {d[A]['open']} | {d[B]['open']} | {d[A]['timings'].get('coverRepair', 0)} | {d[B]['timings'].get('coverRepair', 0)}"
          f" | {d[A]['timings'].get('coverPass', 0)} | {d[B]['timings'].get('coverPass', 0)} | {g(d, A)} | {g(d, B)}")
for c in (A, B):
    tot = sum(d[c]["open"] for d in full.values())
    atf = sum(d[c]["floor"] is not None and abs(d[c]["open"] - d[c]["floor"]) < 1e-6 for d in full.values())
    above = sum(d[c]["open"] - d[c]["floor"] for d in full.values() if d[c]["floor"] is not None)
    ms = sum(d[c]["ms"] for d in full.values()) / max(1, len(full))
    rms = sum(d[c]["timings"].get("coverRepair", 0) for d in full.values()) / max(1, len(full))
    cov = sum(d[c]["open"] > d[c]["coverOpen"] + 1e-9 if d[c]["coverOpen"] is not None else 0 for d in full.values())
    print(f"{c}: {tot:g} open hours in all, {above:g} above the proven floors, at the floor on {atf}, build ms mean {ms:.0f}, repair ms mean {rms:.0f}")
w = sum(d[B]["open"] < d[A]["open"] for d in full.values()); l = sum(d[B]["open"] > d[A]["open"] for d in full.values())
diff = sum(d[A]["open"] - d[B]["open"] for d in full.values())
p1 = 1.0 if w + l == 0 else sum(comb(w + l, i) for i in range(w, w + l + 1)) / 2 ** (w + l)
print(f"{B} vs {A}: fewer open on {w}, more on {l}, tied {len(full) - w - l}, net {diff:+g} h covered (one-sided sign test p = {p1:.3g})")
ok = w > l and p1 < 0.05 and diff > 0
print("decision (eval/repair-reserve-1200-prereg.md):", "MET: lower the default to 1.2 s" if ok else "NOT MET: the default stays at 2 s")
