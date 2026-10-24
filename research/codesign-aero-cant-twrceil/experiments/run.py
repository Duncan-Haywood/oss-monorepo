"""Does the TWR ceiling of 4 in codesign-aero-cant-twr drive its result? Same joint co-design (CMA-ES, 1920 evaluations, 5 seeds, 64 held-out episodes, c = 10th/50th/90th percentile of UIUC static propeller data), TWR free in [1.5, ceiling] with ceiling 4, 6, 8, with and without cant to 35 deg."""
import json, os, sys, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_aero_cant_twrceil import aero as A

TRAIN_EP, TEST_EP, TRAIN_SEED, TEST_SEED = 16, 64, 100, 9999
BUDGET, SEEDS = 1920, 5
CEILS = (4.0, 6.0, 8.0)
ARMS = tuple((cap, c) for cap in (0, 35) for c in CEILS)      # (cant bound deg, TWR ceiling); TWR is free in 1.5..ceiling


def sourced_c():
    import csv
    cs = sorted(float(r["c"]) for r in csv.DictReader(open(os.path.join(HERE, "..", "data", "propdata_c.csv"))) if 3.15 <= float(r["diameter_in"]) <= 9.85)
    return [round(float(v), 3) for v in np.percentile(cs, [10, 50, 90])]


KS = sourced_c()


def cell(args):
    (cap, ceil), k, s = args
    cond = dict(alpha_max=np.deg2rad(max(cap, 1e-9)), kappa_per_d=k, twr_free=True, twr_max=ceil)
    nd = 4
    es = cma.CMAEvolutionStrategy([0.5] * (nd + 6), 0.25, {"bounds": [0, 1], "seed": s + 1, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < BUDGET:
        xs = np.array(es.ask()); ys = A.score(xs[:, :nd], xs[:, nd:], TRAIN_EP, TRAIN_SEED + s, **cond)[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    J, sz, ax = A.score(bx[None, :nd], bx[None, nd:], TEST_EP, TEST_SEED, per_axis=True, **cond)
    return dict(cap=cap, ceil=ceil, k=k, seed=s, rms=float(-J[0]), ok=bool(sz["feasible"][0]), yaw=float(ax[0][2]), alpha_deg=float(np.rad2deg(cond["alpha_max"] * bx[2])),
                twr=float(sz["twr"][0]), mass=float(sz["mass"][0]), cost=float(sz["cost"][0]), wh=float(sz["wh"][0]), D=float(sz["D"][0]), L=float(sz["L"][0]))


if __name__ == "__main__":
    jobs = [(a, k, s) for k in KS for a in ARMS for s in range(SEEDS)]
    with Pool() as p:
        out = p.map(cell, jobs)
    lines = [f"JOINT co-design, {BUDGET} evaluations, held-out {TEST_EP} wide-plant episodes, {SEEDS} seeds; kappa = c D, c from UIUC static propeller data; TWR free in 1.5..ceiling",
             "  c      cant ceil   rms (mean, per seed)                         yaw RMS  twr (mean)  chosen cant (deg)   mass kg  cost $   D m   feasible"]
    table = []
    for k in KS:
        for (cap, ceil) in ARMS:
            rs = [r for r in out if r["k"] == k and r["cap"] == cap and r["ceil"] == ceil]
            row = dict(k=k, cap=cap, ceil=ceil, rms=float(np.mean([r["rms"] for r in rs])), rms_seeds=[r["rms"] for r in rs], yaw=float(np.mean([r["yaw"] for r in rs])),
                       twr=float(np.mean([r["twr"] for r in rs])), twr_seeds=[r["twr"] for r in rs], alpha=[r["alpha_deg"] for r in rs], mass=float(np.mean([r["mass"] for r in rs])),
                       cost=float(np.mean([r["cost"] for r in rs])), D=float(np.mean([r["D"] for r in rs])), feasible=int(sum(r["ok"] for r in rs)))
            table.append(row)
            lines.append(f"  {k:5.3f}  {cap:3d}  {ceil:3.0f}   {row['rms']:6.2f} ({', '.join(f'{v:.2f}' for v in row['rms_seeds'])})  {row['yaw']:6.2f}   {row['twr']:5.2f}   {', '.join(f'{a:.0f}' for a in row['alpha']):18s}  {row['mass']:6.2f}  {row['cost']:6.0f}  {row['D']:.3f}  {row['feasible']}/{SEEDS}")
    def paired(label, a_arm, b_arm):
        lines.append(label)
        for k in KS:
            ra = {r["seed"]: r["rms"] for r in out if r["k"] == k and (r["cap"], r["ceil"]) == a_arm}
            d = [r["rms"] - ra[r["seed"]] for r in out if r["k"] == k and (r["cap"], r["ceil"]) == b_arm]
            lines.append(f"  c={k}: mean {np.mean(d):+.2f}, better in {sum(x < 0 for x in d)} of {len(d)}")
    lines.append("")
    paired("No cant: ceiling 6 vs 4 (negative = more headroom helps)", (0, 4.0), (0, 6.0))
    paired("No cant: ceiling 8 vs 6", (0, 6.0), (0, 8.0))
    paired("Cant 35: ceiling 6 vs 4", (35, 4.0), (35, 6.0))
    paired("Cant 35: ceiling 8 vs 6", (35, 6.0), (35, 8.0))
    for ce in CEILS:
        paired(f"Cant 35 vs no cant, both with ceiling {ce:.0f}", (0, ce), (35, ce))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(arms=[list(a) for a in ARMS], cs=list(KS), table=table, runs=out), open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))
