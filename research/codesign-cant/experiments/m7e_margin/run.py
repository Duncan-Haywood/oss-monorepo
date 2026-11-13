"""Milestone 7e: train the integrator feed-forward designs with milestone 7c's linear stability margin as a CMA-ES constraint.

Milestone 7c found that CMA-ES, left alone, tuned the attitude integrator gain of the `integ` designs onto the linear stability
boundary (ceiling multiple 0.88-1.11), and that a design cut to 0.8x its ceiling held position as well as one with no feed-forward.
Here the same CMA-ES (milestone 6's budget, episodes, seeds and starts; milestone 7b's `integ` arm, 12 coordinates) is run with one
change: a candidate is feasible only if `linstab.worst_radius` (both horizontal axes, the eight corners of the `wide` plant
randomisation) is below 1 at its own ki and at MARGIN x its ki, i.e. ki <= ki_ceiling / MARGIN. Infeasible candidates are not
simulated; they score -100 - 10 min(rho - 1, 10), below every simulated score (>= -99), so the search is pushed back by how
unstable they are. Both rigid centre-of-pressure geometries of milestone 6b.

Held-out: 64 episodes (seed 9999), lever 0, 1 and 2 x the inherited 0.05 + 0.3 L, side force on. The comparison arm is milestone
7b's `integ retrained` designs (same seeds, unconstrained), re-scored here by the same function.
Predictions E1-E4 in ../../LOG.md, written and committed before this was run.
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
GEOMS = {"above": P.cop_signs(1.0), "below": P.cop_signs(-1.0)}
LEVERS = (0.0, 1.0, 2.0)
MARGIN = 1.25                     # ki <= 0.8 x ceiling
SMOKE = os.environ.get("SMOKE") == "1"
BUDGET = 64 if SMOKE else M6.BUDGET
SEEDS = 2 if SMOKE else M6.SEEDS
TRAIN_EP = 4 if SMOKE else M6.TRAIN_EP
TEST_EP = 8 if SMOKE else M6.TEST_EP
TEST_SEED = 4242 if SMOKE else M6.TEST_SEED   # the smoke run never touches the held-out seed


def margin_rho(xs):
    """Worst spectral radius over both axes, the eight plant corners, and ki x {1, MARGIN}; < 1 means feasible."""
    dp = S.design_params(xs)
    r1 = S.worst_radius(dp, 1.0, "integ")
    q = dict(dp); q["ki"] = dp["ki"] * MARGIN
    return np.maximum(r1, S.worst_radius(q, 1.0, "integ"))


def one(args):
    geom, s, k = args
    x0 = [0.5] * 12; x0[2] = M6.STARTS[k]
    es = cma.CMAEvolutionStrategy(x0, 0.25, {"bounds": [0, 1], "seed": 100 * (s + 1) + k, "popsize": 16, "verbose": -9})
    best, bx, n, ninf = -1e9, None, 0, 0
    while n < BUDGET:
        xs = np.array(es.ask())
        rho = margin_rho(xs)
        ok = rho < 1.0
        ys = -100.0 - 10.0 * np.minimum(rho - 1.0, 10.0)
        if ok.any():
            ys[ok] = P.score(xs[ok], TRAIN_EP, M6.TRAIN_SEED + s, dist_sign=GEOMS[geom], ff=1.0, ff_mode="integ", **M6.cond("aware"))[0]
        n += len(xs); ninf += int((~ok).sum()); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return geom, s, k, float(best), bx.tolist(), ninf


def evaluate(geom, s, bx, label):
    x = np.array(bx)[None]
    r = dict(geom=geom, seed=s, label=label, x=bx)
    for lev in LEVERS:
        c = M6.cond("aware")
        J, sz, o = P.score(x, TEST_EP, TEST_SEED, parts=True, dist_sign=GEOMS[geom], lever_scale=lev, ff=1.0, ff_mode="integ", **c)
        t = f"{lev:g}"
        r.update({f"J_{t}": float(J[0]), f"pos_{t}": float(o["pos"][0]), f"yaw_{t}": float(o["yaw"][0]), f"dead_{t}": float(o["dead"][0])})
    dp = S.design_params(x)
    g = P.phys_gains(x[:, 3:12])
    r.update(alpha_deg=float(np.rad2deg(sz["alpha"][0])), power=float(sz["power"][0]), ki_over_kp=float(g[0, 2] / g[0, 0]),
             ceil=float(S.ki_ceiling(dp, 1.0, "integ")[0]), rho_own=float(S.worst_radius(dp, 1.0, "integ")[0]),
             growth_own=float(S.growth_rate(S.worst_radius(dp, 1.0, "integ")[0])))
    return r


def summarise(out, train):
    f = lambda v: ", ".join(f"{x:.2f}" for x in v)
    sel = lambda g, lab: sorted((r for r in out if r["geom"] == g and r["label"] == lab), key=lambda r: r["seed"])
    L = [f"Milestone 7e: integrator feed-forward designs trained with the linear margin ki <= ceiling / {MARGIN} (both axes, 8 plant corners) as a constraint.",
         f"{SEEDS} seeds, best of {len(M6.STARTS)} CMA-ES starts x {BUDGET} evaluations on {TRAIN_EP} episodes; held-out {TEST_EP} episodes (seed {TEST_SEED}), side force on.",
         "unconstrained = milestone 7b's `integ retrained` designs, re-scored here. ceil = ki_ceiling multiple (stable up to ceil x own ki);",
         "dead = share of held-out episodes that diverged; seeds dead = per-seed count.", ""]
    for g in GEOMS:
        inf = [t[5] / BUDGET for t in train if t[0] == g]
        L.append(f"[{g}] share of training candidates rejected as linearly infeasible: mean {np.mean(inf):.2f} (range {min(inf):.2f}-{max(inf):.2f})")
        for lab in ("unconstrained", "constrained"):
            rs = sel(g, lab)
            L.append(f"[{g}, {lab}] cant deg {f([r['alpha_deg'] for r in rs])}; hover W {np.mean([r['power'] for r in rs]):.1f}; ki/kp {f([r['ki_over_kp'] for r in rs])}")
            L.append(f"  ceil {f([r['ceil'] for r in rs])}; worst rho at own ki {', '.join(f'{r['rho_own']:.4f}' for r in rs)}")
            for lev in LEVERS:
                t = f"{lev:g}"
                nd = [int(round(r[f"dead_{t}"] * TEST_EP)) for r in rs]
                L.append(f"  lever {t}: J {np.mean([r[f'J_{t}'] for r in rs]):+.3f} ({', '.join(f'{r[f'J_{t}']:+.2f}' for r in rs)}); pos {np.mean([r[f'pos_{t}'] for r in rs]):.3f} "
                         f"(median {np.median([r[f'pos_{t}'] for r in rs]):.3f}); yaw {np.mean([r[f'yaw_{t}'] for r in rs]):.2f}; dead {np.mean([r[f'dead_{t}'] for r in rs]):.3f} (seeds dead {nd})")
        a, b = sel(g, "constrained"), sel(g, "unconstrained")
        for lev in LEVERS:
            t = f"{lev:g}"
            dj = [x[f"J_{t}"] - y[f"J_{t}"] for x, y in zip(a, b)]
            dd = [round((x[f"dead_{t}"] - y[f"dead_{t}"]) * TEST_EP) for x, y in zip(a, b)]
            L.append(f"  [{g}] constrained minus unconstrained, lever {t}: J {np.mean(dj):+.3f} (se {np.std(dj, ddof=1) / np.sqrt(len(dj)):.3f}; better in {sum(v > 0 for v in dj)} of {len(dj)}); "
                     f"diverged episodes {sum(dd):+d} ({', '.join(f'{v:+d}' for v in dd)})")
        L.append("")
    return L


if __name__ == "__main__":
    t0 = time.time()
    jobs = [(g, s, k) for g in GEOMS for s in range(SEEDS) for k in range(len(M6.STARTS))]
    with Pool() as p:
        train = p.map(one, jobs, chunksize=1)
    ev = []
    for g in GEOMS:
        for s in range(SEEDS):
            b = max((r for r in train if r[:2] == (g, s)), key=lambda r: r[3])
            ev.append((g, s, b[4], "constrained"))
    for r in json.load(open(os.path.join(HERE, "..", "m7b_integ", "results.json")))["runs"]:
        if r["label"] == "integ retrained" and r["seed"] < SEEDS:
            ev.append((r["geom"], r["seed"], r["x"], "unconstrained"))
    with Pool() as p:
        out = p.starmap(evaluate, ev)
    lines = summarise(out, train) + [f"wall time {time.time() - t0:.0f} s"]
    tag = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{tag}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(margin=MARGIN, budget=BUDGET, levers=LEVERS, train=[dict(geom=t[0], seed=t[1], start=t[2], best=t[3], x=t[4], rejected=t[5]) for t in train],
                   runs=out), open(os.path.join(HERE, f"results{tag}.json"), "w"), indent=1)
    print("\n".join(lines))
