"""Milestone 7f: sweep the linear stability margin used as a CMA-ES constraint (milestone 7e's first next step).

Milestone 7e trained the `integ` designs with ki <= ceiling / 1.25 as a constraint (one margin). Here the same training (milestone
6's CMA-ES budget, episodes, seeds and starts; milestone 7b's `integ` arm) is repeated for the centre-of-pressure-above geometry,
the one where the constraint binds, at four more margins: M = 1.0 (only "every plant corner stable at the design's own ki"),
1.11 (ki <= 0.9 x ceiling), 1.43 (0.7x) and 1.67 (0.6x). M = 1.25 is milestone 7e's run, re-scored here from its results.json,
and the unconstrained arm is milestone 7b's `integ retrained`, also re-scored. Held-out: 64 episodes (seed 9999), lever 0, 1, 2,
at the default 20 deg tilt-command limit and at 45 deg (milestone 7d's widened limit; 60 deg tilt counts as divergence).
Predictions F1-F6 in ../../LOG.md, written and committed before this was run at full budget.
"""
import json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m6_poshold"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import run as M6  # noqa: E402  (milestone 6: constants, cond(), the CMA-ES settings)
from codesign_cant import linstab as S  # noqa: E402

P = M6.P
GEOM = "above"
SIGN = P.cop_signs(1.0)
LEVERS = (0.0, 1.0, 2.0)
CAPS = (20.0, 45.0)
NEW_MARGINS = (1.0, 1.0 / 0.9, 1.0 / 0.7, 1.0 / 0.6)
SMOKE = os.environ.get("SMOKE") == "1"
BUDGET = 64 if SMOKE else M6.BUDGET
SEEDS = 2 if SMOKE else M6.SEEDS
TRAIN_EP = 4 if SMOKE else M6.TRAIN_EP
TEST_EP = 8 if SMOKE else M6.TEST_EP
TEST_SEED = 4242 if SMOKE else M6.TEST_SEED   # the smoke run never touches the held-out seed
DEFAULT_CAP = P.TILT_CMD_MAX


def margin_rho(xs, margin):
    """Worst spectral radius over both axes, the eight plant corners, and ki x {1, margin}; < 1 means feasible."""
    dp = S.design_params(xs)
    r = S.worst_radius(dp, 1.0, "integ")
    if margin > 1.0:
        q = dict(dp); q["ki"] = dp["ki"] * margin
        r = np.maximum(r, S.worst_radius(q, 1.0, "integ"))
    return r


def one(args):
    margin, s, k = args
    x0 = [0.5] * 12; x0[2] = M6.STARTS[k]
    es = cma.CMAEvolutionStrategy(x0, 0.25, {"bounds": [0, 1], "seed": 100 * (s + 1) + k, "popsize": 16, "verbose": -9})
    best, bx, n, ninf = -1e9, None, 0, 0
    while n < BUDGET:
        xs = np.array(es.ask())
        rho = margin_rho(xs, margin)
        ok = rho < 1.0
        ys = -100.0 - 10.0 * np.minimum(rho - 1.0, 10.0)
        if ok.any():
            ys[ok] = P.score(xs[ok], TRAIN_EP, M6.TRAIN_SEED + s, dist_sign=SIGN, ff=1.0, ff_mode="integ", **M6.cond("aware"))[0]
        n += len(xs); ninf += int((~ok).sum()); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return margin, s, k, float(best), bx.tolist(), ninf


def evaluate(label, s, bx):
    x = np.array(bx)[None]
    r = dict(label=label, seed=s, x=bx)
    for cap in CAPS:
        P.TILT_CMD_MAX = np.deg2rad(cap)    # module constant read by rollout at call time; this worker process only
        for lev in LEVERS:
            J, sz, o = P.score(x, TEST_EP, TEST_SEED, parts=True, dist_sign=SIGN, lever_scale=lev, ff=1.0, ff_mode="integ", **M6.cond("aware"))
            t = f"{cap:g}_{lev:g}"
            r.update({f"J_{t}": float(J[0]), f"pos_{t}": float(o["pos"][0]), f"dead_{t}": int(round(float(o["dead"][0]) * TEST_EP))})
    P.TILT_CMD_MAX = DEFAULT_CAP
    dp = S.design_params(x)
    g = P.phys_gains(x[:, 3:12])
    r.update(alpha_deg=float(np.rad2deg(sz["alpha"][0])), power=float(sz["power"][0]), ki_over_kp=float(g[0, 2] / g[0, 0]),
             ceil=float(S.ki_ceiling(dp, 1.0, "integ")[0]))
    return r


def summarise(out, train, labels):
    L = ["Milestone 7f: centre of pressure above; integrator feed-forward designs trained with ki <= ceiling / M as a constraint (both axes, 8 plant corners).",
         f"{SEEDS} seeds, best of {len(M6.STARTS)} CMA-ES starts x {BUDGET} evaluations on {TRAIN_EP} episodes; held-out {TEST_EP} episodes (seed {TEST_SEED}), side force on.",
         "unconstrained = milestone 7b's `integ retrained`; M=1.25 = milestone 7e's constrained designs; both re-scored here.",
         "ceil = ki_ceiling multiple; dead = held-out episodes diverged, summed over seeds (per-seed in brackets); cap = tilt-command limit.", ""]
    base = sorted((r for r in out if r["label"] == "unconstrained"), key=lambda r: r["seed"])
    for lab in labels:
        rs = sorted((r for r in out if r["label"] == lab), key=lambda r: r["seed"])
        tr = [t for t in train if f"M={t[0]:.2f}" == lab]
        rej = f"; rejected {np.mean([t[5] for t in tr]) / BUDGET:.2f} of training candidates" if tr else ""
        L.append(f"[{lab}] cant {np.mean([r['alpha_deg'] for r in rs]):.1f} deg; hover W {np.mean([r['power'] for r in rs]):.1f}; "
                 f"ki/kp {', '.join(f'{r['ki_over_kp']:.2f}' for r in rs)}; ceil {', '.join(f'{r['ceil']:.2f}' for r in rs)}{rej}")
        for cap in CAPS:
            for lev in LEVERS:
                t = f"{cap:g}_{lev:g}"
                dj = [a[f"J_{t}"] - b[f"J_{t}"] for a, b in zip(rs, base)]
                L.append(f"  cap {cap:2g}, lever {lev:g}: J {np.mean([r[f'J_{t}'] for r in rs]):+.3f}; minus unconstrained {np.mean(dj):+.3f} "
                         f"(se {np.std(dj, ddof=1) / np.sqrt(len(dj)):.3f}, better in {sum(v > 0 for v in dj)} of {len(dj)}); "
                         f"pos {np.mean([r[f'pos_{t}'] for r in rs]):.3f} m; dead {sum(r[f'dead_{t}'] for r in rs)} {[r[f'dead_{t}'] for r in rs]}")
        L.append("")
    return L


if __name__ == "__main__":
    t0 = time.time()
    jobs = [(m, s, k) for m in NEW_MARGINS for s in range(SEEDS) for k in range(len(M6.STARTS))]
    with Pool() as p:
        train = p.map(one, jobs, chunksize=1)
    ev = []
    for r in json.load(open(os.path.join(HERE, "..", "m7b_integ", "results.json")))["runs"]:
        if r["label"] == "integ retrained" and r["geom"] == GEOM and r["seed"] < SEEDS:
            ev.append(("unconstrained", r["seed"], r["x"]))
    for m in NEW_MARGINS:
        for s in range(SEEDS):
            b = max((t for t in train if t[0] == m and t[1] == s), key=lambda t: t[3])
            ev.append((f"M={m:.2f}", s, b[4]))
    for r in json.load(open(os.path.join(HERE, "..", "m7e_margin", "results.json")))["runs"]:
        if r["label"] == "constrained" and r["geom"] == GEOM and r["seed"] < SEEDS:
            ev.append(("M=1.25", r["seed"], r["x"]))
    with Pool() as p:
        out = p.starmap(evaluate, ev)
    labels = ["unconstrained"] + [f"M={m:.2f}" for m in sorted(list(NEW_MARGINS) + [1.25])]
    lines = summarise(out, train, labels) + [f"wall time {time.time() - t0:.0f} s"]
    tag = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{tag}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(margins=labels, budget=BUDGET, levers=LEVERS, caps=CAPS,
                   train=[dict(margin=t[0], seed=t[1], start=t[2], best=t[3], x=t[4], rejected=t[5]) for t in train], runs=out),
              open(os.path.join(HERE, f"results{tag}.json"), "w"), indent=1)
    print("\n".join(lines))
