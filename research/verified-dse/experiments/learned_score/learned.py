"""Milestone 19: can a score learned on other designs beat the hand-made R2 and R3 scores? Ridge regression of the centred
log routed area-delay product on centred log features that exist at R2 (and R3), fitted on 19 designs (both clocks) and used
to pick on the held-out design's two cells. Runs no flow, no numpy. Usage: python3 learned.py"""
import json
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import stats  # noqa: E402

M = statistics.mean
TABLES = ("rung_bias", "large", "nonarith")
LAMBDA = 1.0  # fixed in advance, not tuned


def feats(r):
    p = r["period_ns"]
    return {
        "la2": math.log(r["synth_netlist_area"]), "lp2": math.log(p - r["synth_netlist_wns"]),
        "lc1": math.log(r["r1_cells"]), "ld1": math.log(r["r1_depth"]),
        "la3": math.log(r["detail_place_area"]), "lp3": math.log(p - r["detail_place_wns"]),
        "y": math.log(r["final_area_notap"] * (p - r["final_wns"])),
    }


SETS = {
    "ridge R2 (a2,p2)": ["la2", "lp2"],
    "ridge R2+R1 (a2,p2,cells,depth)": ["la2", "lp2", "lc1", "ld1"],
    "ridge R3 (a3,p3)": ["la3", "lp3"],
    "ridge R2+R3 (a2,p2,a3,p3)": ["la2", "lp2", "la3", "lp3"],
}


def solve(A, b):
    n = len(b)
    A = [row[:] + [b[i]] for i, row in enumerate(A)]
    for i in range(n):
        j = max(range(i, n), key=lambda k: abs(A[k][i]))
        A[i], A[j] = A[j], A[i]
        for k in range(i + 1, n):
            f = A[k][i] / A[i][i]
            for c in range(i, n + 1):
                A[k][c] -= f * A[i][c]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (A[i][n] - sum(A[i][c] * x[c] for c in range(i + 1, n))) / A[i][i]
    return x


def fit(rows, keys):
    k = len(keys)
    A = [[LAMBDA if i == j else 0.0 for j in range(k)] for i in range(k)]
    b = [0.0] * k
    for x, y in rows:
        for i in range(k):
            b[i] += x[i] * y
            for j in range(k):
                A[i][j] += x[i] * x[j]
    return solve(A, b)


def centred(pool, keys):
    mu = {c: M(f[c] for f in pool) for c in keys + ["y"]}
    return [([f[c] - mu[c] for c in keys], f["y"] - mu["y"]) for f in pool]


cells = {}
for name in TABLES:
    by = defaultdict(list)
    for l in (HERE.parent / name / "results.jsonl").read_text().splitlines():
        r = json.loads(l)
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(feats(r))
    cells.update(by)
designs = sorted({d for _, d in cells})
reg = defaultdict(dict)  # model -> cell -> regret %
for (tag, d), pool in cells.items():
    ref = [math.exp(f["y"]) for f in pool]
    reg["adp2 (hand)"][(tag, d)] = stats.pick_regret([f["la2"] + f["lp2"] for f in pool], ref) * 100
    reg["adp3 (hand)"][(tag, d)] = stats.pick_regret([f["la3"] + f["lp3"] for f in pool], ref) * 100
    reg["in-sample ridge R2+R1 (not held out)"] = reg.get("in-sample ridge R2+R1 (not held out)", {})
for name, keys in SETS.items():
    for held in designs:
        train = [r for (t, d), pool in cells.items() if d != held for r in centred(pool, keys)]
        w = fit(train, keys)
        for (tag, d), pool in cells.items():
            if d != held:
                continue
            ref = [math.exp(f["y"]) for f in pool]
            sc = [sum(wi * f[c] for wi, c in zip(w, keys)) for f in pool]
            reg[name][(tag, d)] = stats.pick_regret(sc, ref) * 100
keys = SETS["ridge R2+R1 (a2,p2,cells,depth)"]
w_all = fit([r for pool in cells.values() for r in centred(pool, keys)], keys)
for (tag, d), pool in cells.items():
    ref = [math.exp(f["y"]) for f in pool]
    reg["in-sample ridge R2+R1 (not held out)"][(tag, d)] = stats.pick_regret([sum(wi * f[c] for wi, c in zip(w_all, keys)) for f in pool], ref) * 100

base = reg["adp2 (hand)"]
L = [f"# milestone 19: learned score vs hand-made ADP, {len(cells)} cells, held out by design (lambda {LAMBDA}), no flow run", ""]
L.append(f"pooled in-sample weights for [la2, lp2, lc1, ld1]: {[round(x, 3) for x in w_all]} (a hand-made ADP has [1, 1, 0, 0] on the first two)")
L.append("")
summary = {}
L.append("model: mean / median / max regret %, cells>10%, cells better / worse than adp2 by >1 point")
for m, v in reg.items():
    vals = [v[c] for c in sorted(v)]
    better = sum(v[c] < base[c] - 1 for c in v)
    worse = sum(v[c] > base[c] + 1 for c in v)
    summary[m] = {"mean": M(vals), "median": statistics.median(vals), "max": max(vals), "over10": sum(x > 10 for x in vals), "better": better, "worse": worse}
    L.append(f"{m:42s} {M(vals):6.2f} {statistics.median(vals):6.2f} {max(vals):7.2f}  {sum(x > 10 for x in vals):3d}  {better:3d} / {worse:3d}")
L.append("")
L.append("per cell regret: tag design | adp2 adp3 R2 R2+R1 R3 R2+R3")
for c in sorted(cells):
    L.append(f"{c[0]:7s} {c[1]:15s}| " + " ".join(f"{reg[m][c]:6.2f}" for m in ("adp2 (hand)", "adp3 (hand)", *SETS)))
(HERE / "results.txt").write_text("\n".join(L) + "\n")
(HERE / "summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(L[:14]))
