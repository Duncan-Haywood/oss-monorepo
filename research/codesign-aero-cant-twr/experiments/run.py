"""Is rotor cant just a cheap way to buy yaw authority that more motor headroom (thrust-to-weight) would buy as well? Same joint co-design as codesign-aero-cant-propdata (kappa = c D, c from the UIUC
static propeller data: 10th percentile, median, 90th percentile of the 77 propellers of 3.15-9.85 in), with thrust-to-weight TWR as an optional extra design variable in [1.5, 4.0] (cost cap $300 and the
motor mass and cost fits stay). Four arms per c: (no cant, TWR fixed at 2) (no cant, TWR free) (cant to 35 deg, TWR fixed) (cant to 35 deg, TWR free). CMA-ES, 1920 evaluations, 5 seeds, held-out 64 episodes."""
import json, os, sys, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_aero_cant_twr import aero as A

TRAIN_EP, TEST_EP, TRAIN_SEED, TEST_SEED = 16, 64, 100, 9999
BUDGET, SEEDS = 1920, 5
ARMS = ((0, False), (0, True), (35, False), (35, True))      # (cant bound deg, TWR free)


def sourced_c():
    import csv
    cs = sorted(float(r["c"]) for r in csv.DictReader(open(os.path.join(HERE, "..", "data", "propdata_c.csv"))) if 3.15 <= float(r["diameter_in"]) <= 9.85)
    return [round(float(v), 3) for v in np.percentile(cs, [10, 50, 90])]


KS = sourced_c()


def cell(args):
    (cap, free), k, s = args
    cond = dict(alpha_max=np.deg2rad(max(cap, 1e-9)), kappa_per_d=k, twr_free=free)
    nd = 4 if free else 3
    es = cma.CMAEvolutionStrategy([0.5] * (nd + 6), 0.25, {"bounds": [0, 1], "seed": s + 1, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < BUDGET:
        xs = np.array(es.ask()); ys = A.score(xs[:, :nd], xs[:, nd:], TRAIN_EP, TRAIN_SEED + s, **cond)[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    J, sz, ax = A.score(bx[None, :nd], bx[None, nd:], TEST_EP, TEST_SEED, per_axis=True, **cond)
    return dict(cap=cap, free=free, k=k, seed=s, rms=float(-J[0]), ok=bool(sz["feasible"][0]), yaw=float(ax[0][2]), alpha_deg=float(np.rad2deg(cond["alpha_max"] * bx[2])),
                twr=float(sz["twr"][0]), mass=float(sz["mass"][0]), cost=float(sz["cost"][0]), wh=float(sz["wh"][0]), D=float(sz["D"][0]), L=float(sz["L"][0]))


if __name__ == "__main__":
    jobs = [(a, k, s) for k in KS for a in ARMS for s in range(SEEDS)]
    with Pool() as p:
        out = p.map(cell, jobs)
    lines = [f"JOINT co-design, {BUDGET} evaluations, held-out {TEST_EP} wide-plant episodes, {SEEDS} seeds; kappa = c D, c from UIUC static propeller data; arms: cant bound x TWR fixed (2.0) or free (1.5-4.0)",
             "  c      cant TWR   rms (mean, per seed)                         yaw RMS  twr (mean)  chosen cant (deg)   mass kg  cost $   D m   feasible"]
    table = []
    for k in KS:
        for (cap, free) in ARMS:
            rs = [r for r in out if r["k"] == k and r["cap"] == cap and r["free"] == free]
            row = dict(k=k, cap=cap, free=free, rms=float(np.mean([r["rms"] for r in rs])), rms_seeds=[r["rms"] for r in rs], yaw=float(np.mean([r["yaw"] for r in rs])),
                       twr=float(np.mean([r["twr"] for r in rs])), twr_seeds=[r["twr"] for r in rs], alpha=[r["alpha_deg"] for r in rs], mass=float(np.mean([r["mass"] for r in rs])),
                       cost=float(np.mean([r["cost"] for r in rs])), D=float(np.mean([r["D"] for r in rs])), feasible=int(sum(r["ok"] for r in rs)))
            table.append(row)
            lines.append(f"  {k:5.3f}  {cap:3d}  {'free' if free else 'fix '}  {row['rms']:6.2f} ({', '.join(f'{v:.2f}' for v in row['rms_seeds'])})  {row['yaw']:6.2f}   {row['twr']:5.2f}   {', '.join(f'{a:.0f}' for a in row['alpha']):18s}  {row['mass']:6.2f}  {row['cost']:6.0f}  {row['D']:.3f}  {row['feasible']}/{SEEDS}")
    def paired(label, a_arm, b_arm):
        lines.append(label)
        for k in KS:
            ra = {r["seed"]: r["rms"] for r in out if r["k"] == k and (r["cap"], r["free"]) == a_arm}
            d = [r["rms"] - ra[r["seed"]] for r in out if r["k"] == k and (r["cap"], r["free"]) == b_arm]
            lines.append(f"  c={k}: mean {np.mean(d):+.2f}, better in {sum(x < 0 for x in d)} of {len(d)}")
    lines.append("")
    paired("TWR free vs fixed, no cant (deg; negative = headroom helps)", (0, False), (0, True))
    paired("Cant 35 vs no cant, TWR fixed (the parent's comparison)", (0, False), (35, False))
    paired("Cant 35 vs no cant, both with TWR free (does cant still help once headroom is bought?)", (0, True), (35, True))
    paired("Cant 35 with TWR fixed vs no cant with TWR free (which single lever is worth more?)", (0, True), (35, False))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(arms=[list(a) for a in ARMS], cs=list(KS), table=table, runs=out), open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))
