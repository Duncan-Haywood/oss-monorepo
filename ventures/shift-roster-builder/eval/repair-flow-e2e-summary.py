"""Summarise eval/repair-flow-e2e.jsonl (end to end, 20 s budget): open hours per configuration, paired by week and seed.
   python3 eval/repair-flow-e2e-summary.py eval/repair-flow-e2e.jsonl > eval/repair-flow-e2e.out.txt"""
import json, sys
from math import comb
rows = [json.loads(l) for l in open(sys.argv[1]) if l.startswith("{")]
by = {}
for r in rows:
    by.setdefault((r["P"], r["S"], r["week"], r["seed"]), {})[r["cfg"]] = r
cfgs = ["dfs", "flow", "dfs2000", "flow2000"]
def sign(w, l):
    n = w + l
    if n == 0: return 1.0
    return min(1.0, 2 * sum(comb(n, i) for i in range(min(w, l) + 1)) / 2 ** n)
print("build (P S week seed) | floor | " + " | ".join(cfgs))
full = {k: d for k, d in by.items() if all(c in d for c in cfgs)}
for k in sorted(full):
    d = full[k]
    print(f"{k} | {d['flow']['floor']} | " + " | ".join(str(d[c]["open"]) for c in cfgs))
print(f"\n{len(full)} builds with every configuration")
for c in cfgs:
    tot = sum(d[c]["open"] for d in full.values())
    atf = sum(d[c]["floor"] is not None and abs(d[c]["open"] - d[c]["floor"]) < 1e-6 for d in full.values())
    rep = [d[c]["timings"].get("coverRepair", 0) for d in full.values() if d[c].get("timings")]
    print(f"{c}: {tot:g} open hours in all, at the proven floor on {atf}, repair ms mean {sum(rep) / max(1, len(rep)):.0f}")
for a, b in [("flow", "dfs"), ("flow2000", "dfs2000"), ("flow2000", "flow"), ("dfs2000", "dfs")]:
    w = sum(d[a]["open"] < d[b]["open"] for d in full.values()); l = sum(d[a]["open"] > d[b]["open"] for d in full.values())
    print(f"{a} vs {b}: fewer open on {w}, more on {l}, tied {len(full) - w - l} (sign test p = {sign(w, l):.3g})")
