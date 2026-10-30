"""Quantile-of-g certificate for halving regret versus realised regret (milestone 41).
Runs no flow. Writes quantile_g_results.txt. Usage: python3 quantile_g.py"""
import json
import math
import random
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import bound, flow  # noqa: E402

DRAWS, ETA, QS = 200, 3, (0.5, 0.75, 0.9, 0.95)
rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
by = defaultdict(list)
for r in rows:
    if r["status"] == "ok":
        by[(r["tag"], r["design"])].append(flow.scores(r))


def g_values(s, y, k):
    """g_x^(k) for every candidate x (0 if fewer than k rivals ranked at or ahead of x)."""
    ly = [math.log(v) for v in y]
    out = []
    for x in range(len(s)):
        vals = sorted((max(0.0, ly[z] - ly[x]) for z in range(len(s)) if z != x and s[z] <= s[x]), reverse=True)
        out.append(vals[k - 1] if len(vals) >= k else 0.0)
    return out


def quantile(v, q):
    v = sorted(v)
    return v[min(len(v) - 1, math.ceil(q * len(v)) - 1)]


viol = {q: 0 for q in QS}
cellviol = {q: 0 for q in QS}
nonvac = {q: 0 for q in QS}
total = ncells = 0
out = ["log units; bound_q = sum over cuts of the q-quantile of g_x^(k_j) over all candidates x; violation = realised regret above bound_q",
       "clock | design | start | " + " | ".join(f"viol@{q}" for q in QS) + " | max-bound"]
for tag in ("tight", "relaxed"):
    for d in flow.DESIGNS:
        sc = by[(tag, d)]
        n = len(sc)
        y = [s["r4"] for s in sc]
        s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
        keep = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
        spread = math.log(max(y)) - math.log(min(y))
        for name, rungs, kp in (("r1", ("r1", "r2", "r3"), keep), ("r2", ("r2", "r3"), keep[:2])):
            rng = random.Random(f"qg{tag}{d}{name}")
            regs = [math.log(bound.halve([s[g] for g in rungs], y, kp, rng)) - math.log(min(y)) for _ in range(DRAWS)]
            gs = [g_values(s[g], y, k) for g, k in zip(rungs, kp)]
            mx = sum(max(v) for v in gs)
            row = []
            ncells += 1
            for q in QS:
                b = sum(quantile(v, q) for v in gs)
                nv = sum(r > b + 1e-9 for r in regs)
                viol[q] += nv
                cellviol[q] += nv > 0
                nonvac[q] += b < spread
                row.append(f"{nv / DRAWS:.2f}")
            total += DRAWS
            out.append(f"{tag} | {d} | {name} | " + " | ".join(row) + f" | {mx:.3f}")
out += ["", f"{ncells} cells x {DRAWS} tie-breaks = {total} draws"]
for q in QS:
    out.append(f"q={q}: share of draws with realised regret above bound_q {viol[q] / total:.4f}; cells with any violation {cellviol[q]} of {ncells}; bound_q under the spread in {nonvac[q]} cells")
(HERE / "quantile_g_results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out[-5:]))
