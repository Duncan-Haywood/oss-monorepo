"""Milestone 2: combined torque commands on one thrust polytope (attitude-priority mixer), and a price on hover power.

The milestone-1 joint CMA-ES (arm length, propeller diameter, cant, six PID gains; 1920 evaluations; 5 seeds; 16 training and
64 held-out wide-plant episodes; $300 cap; kappa = c D with c the median of 77 UIUC propellers; actuator "hover"; TWR 2) over
mixer {box, prio} x cant bound {0, 80 deg} x lam {0, 0.1, 0.3, 1} deg per 100 W of hover power, plus prio_free (collective free,
"airmode") at lam {0, 0.3}. Score J = -RMS - lam * P_hover / 100.  Predictions are in ../../LOG.md, written before this was run.
"""
import csv, json, os, sys, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from codesign_cant import aero as A

TRAIN_EP, TEST_EP, TRAIN_SEED, TEST_SEED = 16, 64, 100, 9999
BUDGET, SEEDS = 1920, 5
LAMS = (0.0, 0.1, 0.3, 1.0)
ARMS = [(mix, cap, lam) for mix in ("box", "prio") for lam in LAMS for cap in (0, 80)]
ARMS += [("prio_free", cap, lam) for lam in (0.0, 0.3) for cap in (0, 80)]


def median_c():
    cs = [float(r["c"]) for r in csv.DictReader(open(os.path.join(HERE, "..", "..", "data", "propdata_c.csv"))) if 3.15 <= float(r["diameter_in"]) <= 9.85]
    return round(float(np.percentile(cs, 50)), 3)


C = median_c()


def cond_of(mix, cap, lam):
    return dict(alpha_max=np.deg2rad(max(cap, 1e-9)), kappa_per_d=C, actuator="hover", mixer=mix, lam=lam)


def cell(args):
    (mix, cap, lam), s = args
    cond = cond_of(mix, cap, lam)
    es = cma.CMAEvolutionStrategy([0.5] * 9, 0.25, {"bounds": [0, 1], "seed": s + 1, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < BUDGET:
        xs = np.array(es.ask()); ys = A.score(xs[:, :3], xs[:, 3:], TRAIN_EP, TRAIN_SEED + s, **cond)[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    sat = np.zeros((1, 2))
    J, sz, ax = A.score(bx[None, :3], bx[None, 3:], TEST_EP, TEST_SEED, per_axis=True, sat=sat, **cond)
    rms = float(np.sqrt((ax[0] ** 2).mean()))
    return dict(mix=mix, cap=cap, lam=lam, seed=s, J=float(J[0]), rms=rms, ok=bool(sz["feasible"][0]), roll=float(ax[0][0]), yaw=float(ax[0][2]),
                alpha_deg=float(np.rad2deg(cond["alpha_max"] * np.clip(bx[2], 0, 1))), power=float(sz["power"][0]), mass=float(sz["mass"][0]),
                cost=float(sz["cost"][0]), D=float(sz["D"][0]), L=float(sz["L"][0]), sat_rp=float(sat[0, 0]), sat_yaw=float(sat[0, 1]))


def sel(out, arm):
    return sorted((r for r in out if (r["mix"], r["cap"], r["lam"]) == arm), key=lambda r: r["seed"])


def summarise(out):
    lines = [f"JOINT co-design, actuator hover, TWR 2, {BUDGET} evaluations, held-out {TEST_EP} wide-plant episodes, {SEEDS} seeds; kappa = c D, c = {C} (UIUC median)",
             "score J = -RMS - lam * P_hover / 100 W; sat = share of held-out steps with roll/pitch or yaw scaled down by the mixer",
             "mixer      lam   cant  rms deg (mean; per seed)                  roll   yaw    J       P_hover W  mass kg  chosen cant deg     sat rp  sat yaw  feasible"]
    table = []
    for arm in ARMS:
        rs = sel(out, arm)
        m = lambda k: float(np.mean([r[k] for r in rs]))
        row = dict(mix=arm[0], cap=arm[1], lam=arm[2], rms=m("rms"), rms_seeds=[r["rms"] for r in rs], roll=m("roll"), yaw=m("yaw"), J=m("J"),
                   power=m("power"), power_seeds=[r["power"] for r in rs], mass=m("mass"), alpha=[r["alpha_deg"] for r in rs],
                   sat_rp=m("sat_rp"), sat_yaw=m("sat_yaw"), feasible=int(sum(r["ok"] for r in rs)))
        table.append(row)
        lines.append(f"{arm[0]:9s}  {arm[2]:4.1f}  {arm[1]:3d}   {row['rms']:6.2f} ({', '.join(f'{v:.2f}' for v in row['rms_seeds'])})  {row['roll']:5.2f}  {row['yaw']:5.2f}  "
                     f"{row['J']:7.2f}  {row['power']:8.0f}  {row['mass']:6.2f}   {', '.join(f'{a:.0f}' for a in row['alpha']):18s}  {row['sat_rp']:5.3f}   {row['sat_yaw']:5.3f}    {row['feasible']}/{SEEDS}")
    lines += ["", "Paired by seed: cant <= 80 minus no cant, same mixer and lam (negative = cant better)"]
    for mix in ("box", "prio", "prio_free"):
        for lam in LAMS:
            a, b = sel(out, (mix, 80, lam)), sel(out, (mix, 0, lam))
            if not a:
                continue
            dr = [x["rms"] - y["rms"] for x, y in zip(a, b)]
            dj = [y["J"] - x["J"] for x, y in zip(a, b)]          # cost = -J, so cant-minus-no-cant cost
            lines.append(f"  {mix:9s} lam {lam:3.1f}: RMS {np.mean(dr):+.2f} deg (sd {np.std(dr, ddof=1):.2f}, better in {sum(x < 0 for x in dr)} of 5); "
                         f"composite {np.mean(dj):+.2f} (sd {np.std(dj, ddof=1):.2f}, better in {sum(x < 0 for x in dj)} of 5)")
    lines += ["", "Paired by seed: prio minus box, same cant bound and lam (positive = the shared polytope costs accuracy)"]
    for lam in LAMS:
        for cap in (0, 80):
            d = [x["rms"] - y["rms"] for x, y in zip(sel(out, ("prio", cap, lam)), sel(out, ("box", cap, lam)))]
            lines.append(f"  lam {lam:3.1f} cant<= {cap:2d}: {np.mean(d):+.2f} deg (sd {np.std(d, ddof=1):.2f}, worse in {sum(x > 0 for x in d)} of 5)")
    lines += ["", "Paired by seed: prio_free minus prio (negative = airmode helps)"]
    for lam in (0.0, 0.3):
        for cap in (0, 80):
            d = [x["rms"] - y["rms"] for x, y in zip(sel(out, ("prio_free", cap, lam)), sel(out, ("prio", cap, lam)))]
            lines.append(f"  lam {lam:3.1f} cant<= {cap:2d}: {np.mean(d):+.2f} deg (sd {np.std(d, ddof=1):.2f}, better in {sum(x < 0 for x in d)} of 5)")
    return lines, table


if __name__ == "__main__":
    jobs = [(a, s) for a in ARMS for s in range(SEEDS)]
    with Pool() as p:
        out = p.map(cell, jobs)
    lines, table = summarise(out)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(c=C, arms=[list(a) for a in ARMS], table=table, runs=out), open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("\n".join(lines))
