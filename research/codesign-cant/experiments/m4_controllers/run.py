"""Milestone 4: does a stronger attitude law (INDI, geometric SO(3)) narrow or remove the cant advantage? (H4)

Joint co-design of arm length, propeller diameter, cant and six controller parameters for three attitude laws:
  pid  - the milestone 0-2 per-axis PID (Euler error, output a share of the torque limit);
  indi - incremental nonlinear dynamic inversion (Smeur, Chu and de Croon 2016): attitude and rate P loops, angular-acceleration
         feedback through a tuned two-pole filter, nominal actuator model, tuned effectiveness scale;
  geo  - geometric attitude control on SO(3) (Lee, Leok and McClamroch 2010) with an integral term and gyroscopic cancellation.
Cant bound {0, 80 deg}; attitude-priority mixer on the shared thrust polytope (milestone 2, collective held at hover); TWR 2;
hover power priced at lam = 0.3 deg per 100 W. 10 seeds; three CMA-ES starts per seed (cant coordinate started at 0.05, 0.4, 0.8
of the bound), 1920 evaluations each, the start with the best TRAINING score kept. The PID arms use restarts.py's CMA-ES seeds, so
seeds 0-4 reproduce milestone 2's restart numbers. Held-out: 64 wide-plant episodes (seed 9999), plus the same designs under
twice the gust intensity (gust_std 8) as an out-of-distribution check. Predictions in ../../LOG.md, written before this was run.
"""
import importlib.util, json, os, sys, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("m2_run", os.path.join(HERE, "..", "m2_polytope", "run.py"))
M2 = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(M2)   # shared constants and the UIUC median c

A = M2.A
CTRLS, CAPS, LAM, SEEDS = ("pid", "indi", "geo"), (0, 80), 0.3, 10
STARTS = (0.05, 0.4, 0.8)
ARMS = [(c, cap) for c in CTRLS for cap in CAPS]


def cond_of(ctrl, cap):
    return dict(M2.cond_of("prio", cap, LAM), ctrl=ctrl)


def one(args):
    (ctrl, cap), s, k = args
    cond = cond_of(ctrl, cap)
    x0 = [0.5] * 9; x0[2] = STARTS[k]
    es = cma.CMAEvolutionStrategy(x0, 0.25, {"bounds": [0, 1], "seed": 100 * (s + 1) + k, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < M2.BUDGET:
        xs = np.array(es.ask()); ys = A.score(xs[:, :3], xs[:, 3:], M2.TRAIN_EP, M2.TRAIN_SEED + s, **cond)[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return (ctrl, cap), s, k, float(best), bx.tolist()


def held_out(arm, s, k, bx):
    bx = np.array(bx); cond = cond_of(*arm)
    sat = np.zeros((1, 2))
    J, sz, ax = A.score(bx[None, :3], bx[None, 3:], M2.TEST_EP, M2.TEST_SEED, per_axis=True, sat=sat, **cond)
    _, _, ax8 = A.score(bx[None, :3], bx[None, 3:], M2.TEST_EP, M2.TEST_SEED, per_axis=True, gust_std=8.0, **cond)
    return dict(ctrl=arm[0], cap=arm[1], seed=s, start=k, J=float(J[0]), rms=float(np.sqrt((ax[0] ** 2).mean())),
                roll=float(ax[0][0]), yaw=float(ax[0][2]), rms_gust8=float(np.sqrt((ax8[0] ** 2).mean())),
                alpha_deg=float(np.rad2deg(cond["alpha_max"] * np.clip(bx[2], 0, 1))), power=float(sz["power"][0]),
                mass=float(sz["mass"][0]), sat_rp=float(sat[0, 0]), sat_yaw=float(sat[0, 1]), x=bx.tolist())


def paired(a, b, key, sign=1):
    d = [sign * (x[key] - y[key]) for x, y in zip(a, b)]
    return np.mean(d), np.std(d, ddof=1), sum(v < 0 for v in d), d


def summarise(out):
    sel = lambda c, cap: sorted((r for r in out if r["ctrl"] == c and r["cap"] == cap), key=lambda r: r["seed"])
    m = lambda rs, k: float(np.mean([r[k] for r in rs]))
    lines = [f"Milestone 4: attitude law x cant; mixer prio (collective at hover), TWR 2, lam {LAM} deg/100 W, {SEEDS} seeds, best of 3 CMA-ES starts x {M2.BUDGET} evaluations,",
             f"held-out {M2.TEST_EP} wide-plant episodes; gust8 = same designs at twice the gust intensity; kappa = c D, c = {M2.C}",
             "ctrl  cant  rms deg (mean; per seed)                                              roll   yaw    gust8   J       P_hover W  chosen cant deg (median)  sat rp  sat yaw"]
    for c, cap in ARMS:
        rs = sel(c, cap)
        lines.append(f"{c:4s}  {cap:3d}   {m(rs, 'rms'):6.2f} ({', '.join(f'{r['rms']:.2f}' for r in rs)})  {m(rs, 'roll'):5.2f}  {m(rs, 'yaw'):5.2f}  "
                     f"{m(rs, 'rms_gust8'):6.2f}  {m(rs, 'J'):7.2f}  {m(rs, 'power'):8.0f}   {np.median([r['alpha_deg'] for r in rs]):5.1f} "
                     f"({', '.join(f'{r['alpha_deg']:.0f}' for r in rs)})  {m(rs, 'sat_rp'):5.3f}   {m(rs, 'sat_yaw'):5.3f}")
    n = SEEDS
    lines += ["", "Paired by seed: cant <= 80 minus no cant, same law (negative = cant better)"]
    for c in CTRLS:
        mr, sr, kr, _ = paired(sel(c, 80), sel(c, 0), "rms")
        mj, sj, kj, _ = paired(sel(c, 0), sel(c, 80), "J")
        mg, sg, kg, _ = paired(sel(c, 80), sel(c, 0), "rms_gust8")
        lines.append(f"  {c:4s}: RMS {mr:+.2f} deg (sd {sr:.2f}, better in {kr} of {n}); composite {mj:+.2f} (sd {sj:.2f}, better in {kj} of {n}); gust8 RMS {mg:+.2f} (better in {kg} of {n})")
    lines += ["", "Paired by seed: law minus pid, same cant bound (negative = the law beats PID)"]
    for c in ("indi", "geo"):
        for cap in CAPS:
            mr, sr, kr, _ = paired(sel(c, cap), sel("pid", cap), "rms")
            mg, sg, kg, _ = paired(sel(c, cap), sel("pid", cap), "rms_gust8")
            lines.append(f"  {c:4s} cant<= {cap:2d}: RMS {mr:+.2f} deg (sd {sr:.2f}, better in {kr} of {n}); gust8 {mg:+.2f} (sd {sg:.2f}, better in {kg} of {n})")
    lines += ["", "H4 refutation test: law without cant minus PID with cant (negative = the law without cant matches or beats PID with cant)"]
    for c in ("indi", "geo"):
        mr, sr, kr, _ = paired(sel(c, 0), sel("pid", 80), "rms")
        lines.append(f"  {c:4s} no cant - pid cant: RMS {mr:+.2f} deg (sd {sr:.2f}, law-without-cant better in {kr} of {n})")
    lines += ["", "Shrinkage of the cant advantage: (law's cant-minus-no-cant) minus (pid's), by seed (positive = narrower than under PID)"]
    for c in ("indi", "geo"):
        _, _, _, dl = paired(sel(c, 80), sel(c, 0), "rms")
        _, _, _, dp = paired(sel("pid", 80), sel("pid", 0), "rms")
        d = [x - y for x, y in zip(dl, dp)]
        lines.append(f"  {c:4s}: {np.mean(d):+.2f} deg (sd {np.std(d, ddof=1):.2f}, narrower in {sum(v > 0 for v in d)} of {n})")
    return lines


if __name__ == "__main__":
    jobs = [(a, s, k) for a in ARMS for s in range(SEEDS) for k in range(len(STARTS))]
    with Pool() as p:
        res = p.map(one, jobs, chunksize=1)
    best = []
    for a in ARMS:
        for s in range(SEEDS):
            cand = [r for r in res if r[0] == a and r[1] == s]
            _, _, k, tb, bx = max(cand, key=lambda r: r[3])
            best.append((a, s, k, bx, [round(c[3], 2) for c in sorted(cand, key=lambda r: r[2])]))
    with Pool() as p:
        out = p.starmap(held_out, [(a, s, k, bx) for a, s, k, bx, _ in best])
    for r, b in zip(out, best):
        r["train_starts"] = b[4]
    lines = summarise(out)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(c=M2.C, lam=LAM, arms=[list(a) for a in ARMS], runs=out), open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("\n".join(lines))
