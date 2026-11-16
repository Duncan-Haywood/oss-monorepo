"""Summarise eval/repair-reserve-big.jsonl (flow-bounded repair, no reserve against a 2 s reserve, 350-400 copy weeks, seeds 7-12),
then pool it with seeds 4-6 from eval/repair-flow-e2e.jsonl (same weeks, same two configurations, measured before the at-floor skip,
which changes nothing on a build that ends above its floor).
   python3 eval/repair-reserve-big-summary.py eval/repair-reserve-big.jsonl eval/repair-flow-e2e.jsonl > eval/repair-reserve-big.out.txt"""
import json, sys
from math import comb
A, B = "flow", "flow2000"
def load(path):
    by = {}
    for l in open(path):
        if l.startswith("{"):
            r = json.loads(l)
            if r["cfg"] in (A, B): by.setdefault((r["P"], r["S"], r["week"], r["seed"]), {})[r["cfg"]] = r
    return {k: d for k, d in by.items() if A in d and B in d}
def sign(w, l):
    n = w + l
    return 1.0 if n == 0 else min(1.0, 2 * sum(comb(n, i) for i in range(min(w, l) + 1)) / 2 ** n)
def report(name, full, rows=False):
    print(f"== {name}: {len(full)} builds")
    if rows:
        print("build (P S week seed) | floor | no reserve | 2 s reserve | repair ms (2 s) | gains (2 s)")
        for k in sorted(full):
            d = full[k]; rp = d[B].get("repair") or {}
            print(f"{k} | {d[A]['floor']} | {d[A]['open']} | {d[B]['open']} | {d[B]['timings'].get('coverRepair', 0)} | {rp.get('gains', rp.get('improved', '-')) if isinstance(rp, dict) else '-'}")
    for c in (A, B):
        tot = sum(d[c]["open"] for d in full.values())
        atf = sum(d[c]["floor"] is not None and abs(d[c]["open"] - d[c]["floor"]) < 1e-6 for d in full.values())
        above = sum(d[c]["open"] - d[c]["floor"] for d in full.values() if d[c]["floor"] is not None)
        ms = sum(d[c]["ms"] for d in full.values()) / max(1, len(full))
        print(f"{c}: {tot:g} open hours in all, {above:g} above the proven floors, at the floor on {atf}, build ms mean {ms:.0f}")
    w = sum(d[B]["open"] < d[A]["open"] for d in full.values()); l = sum(d[B]["open"] > d[A]["open"] for d in full.values())
    diff = sum(d[A]["open"] - d[B]["open"] for d in full.values())
    print(f"{B} vs {A}: fewer open on {w}, more on {l}, tied {len(full) - w - l}, net {diff:+g} h covered (sign test p = {sign(w, l):.3g})\n")
new = load(sys.argv[1]); report("seeds 7-12 (this run)", new, rows=True)
if len(sys.argv) > 2:
    old = load(sys.argv[2]); report("seeds 4-6 (eval/repair-flow-e2e.jsonl)", old)
    report("pooled, seeds 4-12", {**old, **new})
if len(sys.argv) > 3:
    # Noise floor: the same no-reserve configuration run twice (eval/repair-reserve-big-noise.sh) on the four weeks above their floors.
    noise = {}
    for l in open(sys.argv[3]):
        if l.startswith("{"):
            r = json.loads(l); noise[(r["P"], r["S"], r["week"], r["seed"])] = r
    pairs = [(new[k][A]["open"], noise[k]["open"], new[k][B]["open"]) for k in noise if k in new]
    w = sum(b < a for a, b, _ in pairs); l = sum(b > a for a, b, _ in pairs)
    print(f"== noise floor: no reserve run twice, {len(pairs)} builds on 90 x 252 and 100 x 280 weeks 0-1")
    print(f"second run vs first: fewer open on {w}, more on {l}, tied {len(pairs) - w - l}, net {sum(a - b for a, b, _ in pairs):+g} h (sign test p = {sign(w, l):.3g})")
    w2 = sum(c < a for a, _, c in pairs); l2 = sum(c > a for a, _, c in pairs)
    print(f"2 s reserve vs first run, same builds: fewer open on {w2}, more on {l2}, tied {len(pairs) - w2 - l2}, net {sum(a - c for a, _, c in pairs):+g} h")
    w3 = sum(c < b for _, b, c in pairs); l3 = sum(c > b for _, b, c in pairs)
    print(f"2 s reserve vs second run, same builds: fewer open on {w3}, more on {l3}, tied {len(pairs) - w3 - l3}, net {sum(b - c for _, b, c in pairs):+g} h")
