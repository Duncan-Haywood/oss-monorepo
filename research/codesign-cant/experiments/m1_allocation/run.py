"""Milestone 1b: rerun the earlier cant co-design with torque limits from the full allocation.

Same joint CMA-ES as codesign-aero-cant-propdata / -twrceil (arm length, propeller diameter, cant, [TWR], six PID gains;
1920 evaluations; 5 seeds; 16 training and 64 held-out wide-plant episodes; $300 cap; kappa = c D with c the median of the
77 in-range UIUC propellers). Arms: cant bound 0, 35, 80 deg x TWR (fixed 2, as -propdata; free in 1.5..6, as -twrceil)
x actuator model ("prior": the earlier formulas, which should reproduce the earlier numbers; "hover": allocation with
collective held at hover; "free": collective free, only for the TWR-free arms).  Predictions are in ../../LOG.md, written
before this script was run.
"""
import csv, json, os, sys, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from codesign_cant import aero as A

TRAIN_EP, TEST_EP, TRAIN_SEED, TEST_SEED = 16, 64, 100, 9999
BUDGET, SEEDS = 1920, 5
ARMS = [(cap, twr, act) for act in ("prior", "hover") for twr in ("2", "free6") for cap in (0, 35, 80)]
ARMS += [(cap, "free6", "free") for cap in (0, 35, 80)]


def median_c():
    cs = [float(r["c"]) for r in csv.DictReader(open(os.path.join(HERE, "..", "..", "data", "propdata_c.csv"))) if 3.15 <= float(r["diameter_in"]) <= 9.85]
    return round(float(np.percentile(cs, 50)), 3)


C = median_c()


def cond_of(cap, twr, act):
    c = dict(alpha_max=np.deg2rad(max(cap, 1e-9)), kappa_per_d=C, actuator=act)
    if twr == "free6":
        c.update(twr_free=True, twr_max=6.0)
    return c


def cell(args):
    (cap, twr, act), s = args
    cond = cond_of(cap, twr, act)
    nd = 4 if twr == "free6" else 3
    es = cma.CMAEvolutionStrategy([0.5] * (nd + 6), 0.25, {"bounds": [0, 1], "seed": s + 1, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < BUDGET:
        xs = np.array(es.ask()); ys = A.score(xs[:, :nd], xs[:, nd:], TRAIN_EP, TRAIN_SEED + s, **cond)[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    J, sz, ax = A.score(bx[None, :nd], bx[None, nd:], TEST_EP, TEST_SEED, per_axis=True, **cond)
    return dict(cap=cap, twr_arm=twr, act=act, seed=s, rms=float(-J[0]), ok=bool(sz["feasible"][0]), roll=float(ax[0][0]), yaw=float(ax[0][2]),
                alpha_deg=float(np.rad2deg(cond["alpha_max"] * np.clip(bx[2], 0, 1))), twr=float(sz["twr"][0]), mass=float(sz["mass"][0]),
                cost=float(sz["cost"][0]), D=float(sz["D"][0]), L=float(sz["L"][0]), tau_roll=float(sz["tau_max"][0]), tau_yaw=float(sz["tau_yaw"][0]))


def summarise(out):
    lines = [f"JOINT co-design, {BUDGET} evaluations, held-out {TEST_EP} wide-plant episodes, {SEEDS} seeds; kappa = c D, c = {C} (UIUC median)",
             "actuator  TWR    cant  rms deg (mean; per seed)                 roll   yaw    chosen cant deg     TWR    yaw/roll torque  feasible"]
    table = []
    for arm in ARMS:
        rs = sorted((r for r in out if (r["cap"], r["twr_arm"], r["act"]) == arm), key=lambda r: r["seed"])
        row = dict(cap=arm[0], twr_arm=arm[1], act=arm[2], rms=float(np.mean([r["rms"] for r in rs])), rms_seeds=[r["rms"] for r in rs],
                   roll=float(np.mean([r["roll"] for r in rs])), yaw=float(np.mean([r["yaw"] for r in rs])), alpha=[r["alpha_deg"] for r in rs],
                   twr=float(np.mean([r["twr"] for r in rs])), ratio=float(np.mean([r["tau_yaw"] / r["tau_roll"] for r in rs])), feasible=int(sum(r["ok"] for r in rs)))
        table.append(row)
        lines.append(f"{arm[2]:8s}  {arm[1]:5s}  {arm[0]:3d}   {row['rms']:6.2f} ({', '.join(f'{v:.2f}' for v in row['rms_seeds'])})  {row['roll']:5.2f}  {row['yaw']:5.2f}  "
                     f"{', '.join(f'{a:.0f}' for a in row['alpha']):18s}  {row['twr']:4.2f}   {row['ratio']:6.3f}           {row['feasible']}/{SEEDS}")
    lines.append("")
    lines.append("Paired by seed: cant arm minus no-cant arm, same actuator model and TWR arm (negative = cant helps)")
    for act in ("prior", "hover", "free"):
        for twr in ("2", "free6"):
            base = {r["seed"]: r["rms"] for r in out if (r["cap"], r["twr_arm"], r["act"]) == (0, twr, act)}
            if not base:
                continue
            for cap in (35, 80):
                d = [r["rms"] - base[r["seed"]] for r in out if (r["cap"], r["twr_arm"], r["act"]) == (cap, twr, act)]
                lines.append(f"  {act:6s} TWR {twr:5s} cant<= {cap:2d}: mean {np.mean(d):+.2f} deg, sd {np.std(d, ddof=1):.2f}, better in {sum(x < 0 for x in d)} of {len(d)}")
    return lines, table


if __name__ == "__main__":
    jobs = [(a, s) for a in ARMS for s in range(SEEDS)]
    with Pool() as p:
        out = p.map(cell, jobs)
    lines, table = summarise(out)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(c=C, arms=[list(a) for a in ARMS], table=table, runs=out), open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("\n".join(lines))
