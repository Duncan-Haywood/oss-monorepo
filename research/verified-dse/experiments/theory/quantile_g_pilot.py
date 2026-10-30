"""Pilot-side quantile-of-g bound versus realised halving regret (milestone 42).
Runs no flow. Writes quantile_g_pilot_results.txt. Usage: python3 quantile_g_pilot.py"""
import json
import math
import random
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import bound, flow  # noqa: E402

DRAWS, PILOTS, M, ETA, QS = 200, 300, 16, 3, (0.5, 0.9, 0.95)
rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
by = defaultdict(list)
for r in rows:
    if r["status"] == "ok":
        by[(r["tag"], r["design"])].append(flow.scores(r))


def g_values(s, y, k):
    ly = [math.log(v) for v in y]
    out = []
    for x in range(len(s)):
        vals = sorted((max(0.0, ly[z] - ly[x]) for z in range(len(s)) if z != x and s[z] <= s[x]), reverse=True)
        out.append(vals[k - 1] if len(vals) >= k else 0.0)
    return out


def quantile(v, q):
    v = sorted(v)
    return v[min(len(v) - 1, math.ceil(q * len(v)) - 1)]


# per q: pilots whose bound is under the realised regret in over 20% / any tie-breaks, share of (pilot, tie-break) draws violating
viol = {q: 0 for q in QS}
cellbad = {q: 0 for q in QS}
nonvac = {q: 0 for q in QS}
medratio = {q: [] for q in QS}
total = ncells = 0
out = ["log units; pilot bound_q = sum over cuts of the q-quantile of g^(k') over a random pilot of 16 (k' = max(1, round(k*16/n)), rivals inside the pilot); violation = realised full-pool regret above it",
       "clock | design | start | " + " | ".join(f"viol@{q}" for q in QS)]
for tag in ("tight", "relaxed"):
    for d in flow.DESIGNS:
        sc = by[(tag, d)]
        n = len(sc)
        y = [s["r4"] for s in sc]
        s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
        keep = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
        spread = math.log(max(y)) - math.log(min(y))
        for name, rungs, kp in (("r1", ("r1", "r2", "r3"), keep), ("r2", ("r2", "r3"), keep[:2])):
            rng = random.Random(f"qgp{tag}{d}{name}")
            regs = [math.log(bound.halve([s[g] for g in rungs], y, kp, rng)) - math.log(min(y)) for _ in range(DRAWS)]
            full = {q: sum(quantile(g_values(s[g], y, k), q) for g, k in zip(rungs, kp)) for q in QS}
            cv = {q: 0 for q in QS}
            nv = {q: 0 for q in QS}
            ncells += 1
            for _ in range(PILOTS):
                idx = rng.sample(range(n), min(M, n))
                py = [y[i] for i in idx]
                ps = {g: [s[g][i] for i in idx] for g in rungs}
                pk = [max(1, round(k * len(idx) / n)) for k in kp]
                gs = [g_values(ps[g], py, k) for g, k in zip(rungs, pk)]
                for q in QS:
                    b = sum(quantile(v, q) for v in gs)
                    nv[q] += sum(r > b + 1e-9 for r in regs)
                    cv[q] += b < spread
                    if full[q] > 0:
                        medratio[q].append(b / full[q])
            row = []
            for q in QS:
                share = nv[q] / (PILOTS * DRAWS)
                viol[q] += nv[q]
                cellbad[q] += share > 0.2
                nonvac[q] += cv[q] / PILOTS > 0.5
                row.append(f"{share:.2f}")
            total += PILOTS * DRAWS
            out.append(f"{tag} | {d} | {name} | " + " | ".join(row))
out += ["", f"{ncells} cells x {PILOTS} pilots x {DRAWS} tie-breaks = {total} draws"]
for q in QS:
    m = sorted(medratio[q])
    out.append(f"q={q}: share of draws with regret above the pilot bound {viol[q] / total:.4f}; cells where that share exceeds 0.2: {cellbad[q]} of {ncells}; pilot bound under the spread in over half the pilots in {nonvac[q]} cells; median pilot/full-table bound {m[len(m) // 2]:.2f}")
(HERE / "quantile_g_pilot_results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out[-5:]))
