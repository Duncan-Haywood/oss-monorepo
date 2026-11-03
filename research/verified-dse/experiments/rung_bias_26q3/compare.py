"""Milestone 48: old (OpenROAD 26Q2 / Yosys 0.33) against re-measured (26Q3 / 0.70) table on the same
pass sequences. Per design and clock: clock target old/new, Kendall tau-b of the R2 and R4 score across
versions, and the share of sequences that fail in ABC. Runs no flow. Usage: python3 compare.py"""
import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(p):
    return [json.loads(l) for l in open(p)]


def tau_b(x, y):
    c = d = tx = ty = 0
    for i in range(len(x)):
        for j in range(i):
            a, b = x[i] - x[j], y[i] - y[j]
            if a * b > 0: c += 1
            elif a * b < 0: d += 1
            elif a == 0 and b != 0: tx += 1
            elif b == 0 and a != 0: ty += 1
    den = ((c + d + tx) * (c + d + ty)) ** 0.5
    return (c - d) / den if den else float("nan")


old, new = load(HERE.parent / "rung_bias/results.jsonl"), load(HERE / "results.jsonl")
ok = lambda rs: {(r["design"], r["tag"], tuple(r["seq"])): r for r in rs if r["status"] == "ok"}
O, N = ok(old), ok(new)
r2 = lambda r: r["synth_netlist_period_ns"] * r["synth_netlist_area"]
r4 = lambda r: r["final_period_ns"] * r["final_area"]
per = lambda rs: {(r["design"], r["tag"]): r["period_ns"] for r in rs}
po, pn = per(old), per(new)
by = defaultdict(list)
for k in set(O) & set(N):
    by[(k[0], k[1])].append(k)
lines = [f"ok points: old {len(O)}, new {len(N)}, shared {len(set(O) & set(N))}; failed in ABC: old {sum(r['status'] != 'ok' for r in old)}, new {sum(r['status'] != 'ok' for r in new)}",
         "design | clock | period ns old -> new | n | tau R2 old,new | tau R4 old,new"]
t2s, t4s = [], []
for (d, c), ks in sorted(by.items()):
    ks.sort()
    a, b = tau_b([r2(O[k]) for k in ks], [r2(N[k]) for k in ks]), tau_b([r4(O[k]) for k in ks], [r4(N[k]) for k in ks])
    t2s.append(a); t4s.append(b)
    lines.append(f"{d} | {c} | {po[(d, c)]} -> {pn[(d, c)]} | {len(ks)} | {a:.2f} | {b:.2f}")
med = lambda v: sorted(v)[len(v) // 2] if len(v) % 2 else sum(sorted(v)[len(v) // 2 - 1:len(v) // 2 + 1]) / 2
lines.append(f"median across {len(t4s)} cells: tau R2 {med(t2s):.2f}, tau R4 {med(t4s):.2f}; clock target changed in {sum(po[k] != pn[k] for k in po)} of {len(po)} cells")
(HERE / "compare_results.txt").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
