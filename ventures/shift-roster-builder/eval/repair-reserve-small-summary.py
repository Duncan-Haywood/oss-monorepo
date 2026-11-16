"""Summarise eval/repair-reserve-small.jsonl (end to end, 20 s budget, 30-60 person weeks): open hours with no repair reserve, a
500 ms and a 2 s reserve, paired by week and seed, and how many builds the reserve could touch at all.
   python3 eval/repair-reserve-small-summary.py eval/repair-reserve-small.jsonl > eval/repair-reserve-small.out.txt"""
import json, sys
from math import comb
rows = [json.loads(l) for l in open(sys.argv[1]) if l.startswith("{")]
by = {}
for r in rows:
    by.setdefault((r["P"], r["S"], r["week"], r["seed"]), {})[r["cfg"]] = r
cfgs = ["flow", "flow500", "flow2000"]
def sign(w, l):
    n = w + l
    if n == 0: return 1.0
    return min(1.0, 2 * sum(comb(n, i) for i in range(min(w, l) + 1)) / 2 ** n)
full = {k: d for k, d in by.items() if all(c in d for c in cfgs)}
print("build (P S week seed) | copies | floor | open: " + " | ".join(cfgs) + " | repair ms: " + " | ".join(cfgs) + " | build s (no reserve)")
for k in sorted(full):
    d = full[k]
    rep = [str((d[c].get("timings") or {}).get("coverRepair", 0)) for c in cfgs]
    print(f"{k} | {d['flow']['copies']} | {d['flow']['floor']} | " + " | ".join(str(d[c]["open"]) for c in cfgs) + " | " + " | ".join(rep) + f" | {d['flow']['ms'] / 1000:.1f}")
print(f"\n{len(full)} builds with every configuration")
proven = {k: d for k, d in full.items() if all(d[c]["floor"] is not None and abs(d[c]["open"] - d[c]["floor"]) < 1e-6 for c in cfgs)}
print(f"{len(proven)} builds at the proven floor under all three (nothing a reserve could change)")
for c in cfgs:
    tot = sum(d[c]["open"] for d in full.values())
    atf = sum(d[c]["floor"] is not None and abs(d[c]["open"] - d[c]["floor"]) < 1e-6 for d in full.values())
    ran = sum(bool(d[c].get("repair")) for d in full.values())
    gains = sum((d[c].get("repair") or {}).get("gains", 0) for d in full.values())
    print(f"{c}: {tot:g} open hours in all, at the proven floor on {atf}, repair ran on {ran}, repair gains {gains}")
for size in sorted({k[:2] for k in full}):
    sub = {k: d for k, d in full.items() if k[:2] == size}
    print(f"  {size[0]} x {size[1]}: " + ", ".join(f"{c} {sum(d[c]['open'] for d in sub.values()):g} h" for c in cfgs))
for a, b in [("flow2000", "flow"), ("flow500", "flow"), ("flow2000", "flow500")]:
    w = sum(d[a]["open"] < d[b]["open"] for d in full.values()); l = sum(d[a]["open"] > d[b]["open"] for d in full.values())
    print(f"{a} vs {b}: fewer open on {w}, more on {l}, tied {len(full) - w - l} (sign test p = {sign(w, l):.3g})")
