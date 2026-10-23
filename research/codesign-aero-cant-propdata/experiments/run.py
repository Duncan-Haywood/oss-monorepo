"""Does the interior cant optimum of codesign-aero-cant-kappa survive when c in kappa = Q/T = c D comes from measured propeller data instead of a swept range? c = CP/(2 pi CT) is read from the UIUC
Propeller Data Site static tests (data/propdata_c.csv, extract_c.py) for the 77 propellers of 3.15-9.85 in (the optimiser's D range, 80-250 mm): 10th percentile, median, 90th percentile and maximum.
JOINT: CMA-ES over (L, D, cant, 6 gains), 1920 evaluations, 5 seeds, held-out 64 episodes; cant bound in {0, 35, 80}; cost cap 300 and the 1.05 clearance rule stay. No LLM is used."""
import json, os, sys, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_aero_cant_propdata import aero as A

TRAIN_EP, TEST_EP, TRAIN_SEED, TEST_SEED = 16, 64, 100, 9999
BUDGET, SEEDS = 1920, 5
CAPS = (0, 35, 80)


def sourced_c():
    import csv
    cs = sorted(float(r["c"]) for r in csv.DictReader(open(os.path.join(HERE, "..", "data", "propdata_c.csv"))) if 3.15 <= float(r["diameter_in"]) <= 9.85)
    q = np.percentile(cs, [10, 50, 90])
    return [round(float(v), 3) for v in q] + [round(cs[-1], 3)]


KS = sourced_c()


def joint_cell(args):
    cap, k, s = args
    cond = dict(alpha_max=np.deg2rad(max(cap, 1e-9)), kappa_per_d=k)
    es = cma.CMAEvolutionStrategy([0.5] * 9, 0.25, {"bounds": [0, 1], "seed": s + 1, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < BUDGET:
        xs = np.array(es.ask()); ys = A.score(xs[:, :3], xs[:, 3:], TRAIN_EP, TRAIN_SEED + s, **cond)[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    J, sz, ax = A.score(bx[None, :3], bx[None, 3:], TEST_EP, TEST_SEED, per_axis=True, **cond)
    return dict(cap=cap, k=k, seed=s, rms=float(-J[0]), ok=bool(sz["feasible"][0]), yaw=float(ax[0][2]), roll_pitch=float(np.sqrt((ax[0][:2] ** 2).mean())),
                alpha_deg=float(np.rad2deg(cond["alpha_max"] * bx[2])), mass=float(sz["mass"][0]), cost=float(sz["cost"][0]), wh=float(sz["wh"][0]),
                L=float(A.L_RANGE[0] + bx[0] * (A.L_RANGE[1] - A.L_RANGE[0])), D=float(A.D_RANGE[0] + bx[1] * (A.D_RANGE[1] - A.D_RANGE[0])))


if __name__ == "__main__":
    jobs = [(c, k, s) for k in KS for c in CAPS for s in range(SEEDS)]
    with Pool() as p:
        out = p.map(joint_cell, jobs)
    lines = [f"JOINT co-design of (L, D, cant, gains), {BUDGET} evaluations, held-out {TEST_EP} wide-plant episodes, {SEEDS} seeds; cant bound varies, kappa = c D, c from UIUC static propeller data",
             "  c      bound  rms (mean, per seed)                         yaw RMS  chosen cant (deg)        mass kg  cost $  Wh   D m   feasible"]
    table = []
    for k in KS:
        for c in CAPS:
            rs = [r for r in out if r["k"] == k and r["cap"] == c]
            row = dict(k=k, cap=c, rms=float(np.mean([r["rms"] for r in rs])), rms_seeds=[r["rms"] for r in rs], yaw=float(np.mean([r["yaw"] for r in rs])),
                       alpha=[r["alpha_deg"] for r in rs], mass=float(np.mean([r["mass"] for r in rs])), cost=float(np.mean([r["cost"] for r in rs])),
                       wh=float(np.mean([r["wh"] for r in rs])), D=float(np.mean([r["D"] for r in rs])), feasible=int(sum(r["ok"] for r in rs)))
            table.append(row)
            lines.append(f"  {str(k):5s} {c:4d}   {row['rms']:6.2f} ({', '.join(f'{v:.2f}' for v in row['rms_seeds'])})  {row['yaw']:6.2f}   {', '.join(f'{a:.0f}' for a in row['alpha']):22s}  {row['mass']:6.2f}  {row['cost']:6.0f}  {row['wh']:5.1f}  {row['D']:.3f}  {row['feasible']}/{SEEDS}")
    lines.append("")
    lines.append("Paired against bound 0 (same seed, same k), deg; negative = more cant helps")
    for k in KS:
        base = {r["seed"]: r["rms"] for r in out if r["k"] == k and r["cap"] == 0}
        for c in CAPS[1:]:
            d = [r["rms"] - base[r["seed"]] for r in out if r["k"] == k and r["cap"] == c]
            lines.append(f"  c={k} bound {c:2d}: mean {np.mean(d):+.2f}, better in {sum(x < 0 for x in d)} of {len(d)}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(caps=list(CAPS), cs=list(KS), table=table, runs=out), open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))
