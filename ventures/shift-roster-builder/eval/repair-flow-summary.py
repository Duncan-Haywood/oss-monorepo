"""Summarise eval/repair-flow.jsonl: total open hours per repair and paired sign tests against the depth-first search.
   python3 eval/repair-flow-summary.py eval/repair-flow.jsonl > eval/repair-flow.out.txt"""
import json, sys
from math import comb
rows = [json.loads(l) for l in open(sys.argv[1]) if l.startswith("{")]
by = {}
for r in rows:
    by.setdefault((r["P"], r["S"], r["week"], r["startSeed"]), {})[r["repair"]] = r
names = ["dfs k3", "flow k3", "dfs k5", "flow k5", "dfs k3 2s", "flow k3 2s", "flow k5 2s"]
def sign(w, l):
    n = w + l
    if n == 0: return 1.0
    k = min(w, l)
    return min(1.0, 2 * sum(comb(n, i) for i in range(k + 1)) / 2 ** n)
print("start (P S week seed) | floor | start | " + " | ".join(names))
for k in sorted(by):
    d = by[k]; any_ = next(iter(d.values()))
    print(f"{k} | {any_['floor']} | {any_['start']} | " + " | ".join(str(d[n]["open"]) if n in d else "-" for n in names))
full = [d for d in by.values() if all(n in d for n in names)]
print(f"\n{len(full)} starts with every repair")
assert all(r["valid"] for d in full for r in d.values())
for n in names:
    tot = sum(d[n]["open"] for d in full); cut = sum(d[n]["start"] - d[n]["open"] for d in full)
    ms = sum(d[n]["ms"] for d in full) / len(full)
    print(f"{n}: total open {tot:g} h, cut from start {cut:g} h, mean {ms:.0f} ms, rounds skipped by the floor {sum(d[n]['skipped'] for d in full)}, searches stopped at the floor {sum(d[n]['reached'] for d in full)}")
for a, b in [("flow k3", "dfs k3"), ("flow k5", "dfs k5"), ("flow k3 2s", "dfs k3 2s"), ("flow k5 2s", "flow k3 2s")]:
    w = sum(d[a]["open"] < d[b]["open"] for d in full); l = sum(d[a]["open"] > d[b]["open"] for d in full)
    print(f"{a} vs {b}: fewer open on {w}, more on {l}, tied {len(full) - w - l} (two-sided sign test p = {sign(w, l):.3g})")
