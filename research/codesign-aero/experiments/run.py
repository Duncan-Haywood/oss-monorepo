"""Joint airframe+controller co-design vs design-first, frozen-controller, bilevel and random search at equal budget,
plus a brute-force grid as ground truth and a gust sweep. Writes results.txt and results.json."""
import json, os, sys, warnings
import numpy as np
import cma

warnings.filterwarnings("ignore")

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_aero import aero as A

BUDGET, N_SEEDS, TRAIN_EP, TEST_EP = 320, 10, 8, 64
TRAIN_SEED, TEST_SEED = 100, 9999
REF_DESIGN = np.array([[0.30, 0.35]])      # hand-picked reference airframe (L ~ 0.15 m, D ~ 0.13 m)


def ev(xd, gu, seed=TRAIN_SEED, gust=4.0, ep=TRAIN_EP):
    return A.score(xd, gu, episodes=ep, seed=seed, gust_std=gust)[0]


def cma_run(dim, fun, budget, seed, x0=None, sigma=0.3, pop=16):
    """fun maps (n, dim) -> (n,) scores (higher better). Returns best x by training score."""
    es = cma.CMAEvolutionStrategy(x0 if x0 is not None else [0.5] * dim, sigma,
                                  {"bounds": [0, 1], "seed": seed + 1, "popsize": pop, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < budget:
        xs = np.array(es.ask()); ys = fun(xs); n += len(xs)
        es.tell(xs.tolist(), (-ys).tolist())
        i = int(np.argmax(ys))
        if ys[i] > best:
            best, bx = ys[i], xs[i].copy()
    return bx, best


def tune_gains(xd, budget, seed, gust=4.0):
    f = lambda g: ev(np.tile(xd, (len(g), 1)), g, gust=gust)
    return cma_run(3, f, budget, seed, sigma=0.25)[0]


def heldout(xd, gu, gust=4.0):
    return float(ev(np.atleast_2d(xd), np.atleast_2d(gu), seed=TEST_SEED, gust=gust, ep=TEST_EP)[0])


def pipelines(seed):
    rng = np.random.default_rng(seed)
    out = {}
    # joint CMA-ES over (L, D, kp, kd, ki)
    x, _ = cma_run(5, lambda z: ev(z[:, :2], z[:, 2:]), BUDGET, seed)
    out["joint CMA-ES"] = (x[:2], x[2:])
    # joint random search
    z = rng.random((BUDGET, 5)); y = ev(z[:, :2], z[:, 2:]); b = z[int(np.argmax(y))]
    out["joint random search"] = (b[:2], b[2:])
    # design first: lightest feasible airframe on a grid, then tune the controller with the whole budget
    g = np.stack(np.meshgrid(np.linspace(0, 1, 21), np.linspace(0, 1, 21)), -1).reshape(-1, 2)
    sz = A.size(A.L_RANGE[0] + g[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]), A.D_RANGE[0] + g[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0]))
    mass = np.where(sz["feasible"], sz["mass"], 9e9); xd = g[int(np.argmin(mass))]
    out["design-first (lightest) + tuned controller"] = (xd, tune_gains(xd[None], BUDGET, seed))
    # frozen controller: gains tuned on the reference airframe, then the airframe searched with those gains fixed
    gref = tune_gains(REF_DESIGN, BUDGET // 2, seed)
    xd, _ = cma_run(2, lambda d: ev(d, np.tile(gref, (len(d), 1))), BUDGET // 2, seed)
    out["frozen controller (tuned on reference, airframe searched)"] = (xd, gref)
    # bilevel: outer CMA over the airframe, inner CMA over gains (2 generations of 8 per candidate -> 16 evals each)
    inner = 16
    def outer(d):
        return np.array([ev(di[None], tune_gains(di[None], inner, seed)[None]).item() for di in d])
    xd, _ = cma_run(2, outer, BUDGET // inner, seed, pop=4)
    out["bilevel (outer airframe CMA, inner gains CMA)"] = (xd, tune_gains(xd[None], inner, seed))
    return out


def grid(gust=4.0, n=11, inner=192):
    ls, ds = np.linspace(0, 1, n), np.linspace(0, 1, n)
    J = np.full((n, n), np.nan); best = (-1e9, None, None)
    for i, a in enumerate(ls):
        for j, b in enumerate(ds):
            xd = np.array([[a, b]])
            if not A.size(*[v for v in (A.L_RANGE[0] + a * (A.L_RANGE[1] - A.L_RANGE[0]), A.D_RANGE[0] + b * (A.D_RANGE[1] - A.D_RANGE[0]))])["feasible"]:
                continue
            gu = tune_gains(xd, inner, 7, gust=gust)
            J[i, j] = heldout(xd[0], gu, gust=gust)
            if J[i, j] > best[0]:
                best = (J[i, j], xd[0], gu)
    return J, best


if __name__ == "__main__":
    lines, R = [], {}
    P = lambda s="": (lines.append(s), print(s))
    # 1. ground truth
    J, (jb, xb, gb) = grid()
    L = lambda x: A.L_RANGE[0] + x * (A.L_RANGE[1] - A.L_RANGE[0]); D = lambda x: A.D_RANGE[0] + x * (A.D_RANGE[1] - A.D_RANGE[0])
    P(f"grid 11x11 (inner CMA-ES 192 evals per cell, held-out 64 episodes, gust sd 4 m/s): best J={jb:.2f} deg RMS at L={L(xb[0]):.3f} m, D={D(xb[1]):.3f} m; feasible cells {int(np.isfinite(J).sum())}/121")
    P(f"grid median J={np.nanmedian(J):.2f}, worst feasible J={np.nanmin(J):.2f}")
    R["grid"] = np.nan_to_num(J, nan=-99).tolist(); R["grid_best"] = [float(jb), float(L(xb[0])), float(D(xb[1]))]
    # reference airframe with its own tuned controller
    gref = tune_gains(REF_DESIGN, 192, 7)
    Jref = heldout(REF_DESIGN[0], gref)
    P(f"reference airframe L={L(REF_DESIGN[0][0]):.3f} D={D(REF_DESIGN[0][1]):.3f} with tuned gains: J={Jref:.2f}")
    # controller transfer: gains tuned on the reference, used unchanged on every grid airframe
    tr = np.full(J.shape, np.nan)
    for i, a in enumerate(np.linspace(0, 1, 11)):
        for j, b in enumerate(np.linspace(0, 1, 11)):
            if np.isfinite(J[i, j]):
                tr[i, j] = heldout(np.array([a, b]), gref)
    ok = np.isfinite(J)
    P(f"reference gains reused unchanged on all feasible airframes: median J={np.nanmedian(tr):.2f} vs {np.nanmedian(J):.2f} retuned; "
      f"share of cells where the reused controller is worse by >1 deg: {np.mean((J[ok] - tr[ok]) > 1.0):.2f}; unstable (>40 deg RMS) {np.mean(tr[ok] < -40):.2f}")
    R["transfer"] = {"median_reused": float(np.nanmedian(tr)), "median_retuned": float(np.nanmedian(J)),
                     "share_worse_gt1": float(np.mean((J[ok] - tr[ok]) > 1.0)), "share_unstable": float(np.mean(tr[ok] < -40))}
    # 2. pipelines
    P(f"\npipelines at equal budget ({BUDGET} candidate evaluations of 8 training episodes), {N_SEEDS} seeds, J = held-out RMS roll error in deg (lower is better, shown as positive):")
    res = {}
    for s in range(N_SEEDS):
        for name, (xd, gu) in pipelines(s).items():
            res.setdefault(name, []).append(-heldout(xd, gu))
    for name, v in res.items():
        v = np.array(v)
        P(f"  {name:62s} mean {v.mean():6.2f}  median {np.median(v):6.2f}  worst {v.max():6.2f}  best {v.min():6.2f}")
    P(f"  gap to grid optimum ({-jb:.2f}): " + ", ".join(f"{k.split(' (')[0]} {np.mean(v) + jb:+.2f}" for k, v in res.items()))
    names = list(res); jc = np.array(res["joint CMA-ES"])
    for k in names[1:]:
        P(f"  paired over seeds: joint CMA-ES beats {k.split(' (')[0]} in {int(np.sum(jc < np.array(res[k])))}/{N_SEEDS} seeds")
    R["pipelines"] = {k: v for k, v in res.items()}; R["pipeline_budget"] = BUDGET
    # 3. gust sweep
    P("\ngust sweep (grid optimum per gust level, 9x9 grid):")
    sw = []
    for gs in (0.0, 2.0, 4.0, 6.0):
        Jg, (jbg, xbg, _) = grid(gust=gs, n=9, inner=128)
        sw.append([gs, float(-jbg), float(L(xbg[0])), float(D(xbg[1]))])
        P(f"  gust sd {gs:.0f} m/s: best RMS error {-jbg:.2f} deg at L={L(xbg[0]):.3f} m, D={D(xbg[1]):.3f} m")
    R["gust_sweep"] = sw
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(R, open(os.path.join(HERE, "results.json"), "w"))
