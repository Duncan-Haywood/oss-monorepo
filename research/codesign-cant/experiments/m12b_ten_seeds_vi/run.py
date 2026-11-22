"""Milestone 12b: section VI's margin sweep (Table VI-1, milestones 7b, 7e and 7f) at ten seeds.

Milestones 7b (`integ retrained`, unconstrained), 7e (ki <= ceiling / 1.25) and 7f (M = 1.0, 1.11, 1.43, 1.67) trained the
centre-of-pressure-above integrator feed-forward designs at seeds 0-5. This script trains seeds 6-9 of all six arms with the
same code path (milestone 6's CMA-ES: 3200 evaluations, popsize 16, 16 training episodes on seed 100 + s, starts 0.4 and 0.8,
CMA seed 100 (s + 1) + k; a constrained candidate whose 11-state linear model is unstable at a plant corner at ki or ki x M is
not simulated and scores -100 - 10 min(rho - 1, 10)). The unconstrained arm is the same loop with no rejection, which is
milestone 7b's `one` line for line. Every design, seeds 0-9, is then scored by milestone 7f's `evaluate` (64 held-out episodes,
seed 9999, levers 0/1/2, tilt-command limits 20 and 45 deg).

Reproduction checks first (R0): 7f's M = 1.0 seed 0 start 0 is retrained and must give the stored best training score; 7b's
unconstrained seed 0 is retrained (both starts) and must give the stored design; the re-scored seeds 0-5 must equal 7f's stored
held-out numbers. Predictions MB0-MB6 in ../../LOG.md, committed before the full run.
SMOKE=1: 2 new seeds (6, 7), 64 evaluations, 4 training episodes, scored on seed 4242 (never the held-out seed).
"""
import json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location("m7f_run", os.path.join(HERE, "..", "m7f_sweep", "run.py"))
F = importlib.util.module_from_spec(_spec); sys.modules["m7f_run"] = F
_spec.loader.exec_module(F)  # milestone 7f: evaluate(), margin_rho(); it imports milestone 6's run.py as `run`

M6, P, S = F.M6, F.P, F.S
SMOKE = os.environ.get("SMOKE") == "1"
BUDGET = 64 if SMOKE else M6.BUDGET
TRAIN_EP = 4 if SMOKE else M6.TRAIN_EP
NEW_SEEDS = (6, 7) if SMOKE else (6, 7, 8, 9)
OLD_SEEDS = range(6)
ARMS = (None, 1.0, 1.0 / 0.9, 1.25, 1.0 / 0.7, 1.0 / 0.6)       # None = unconstrained (milestone 7b's arm)
if SMOKE:                                                       # 7f's evaluate reads these module constants at call time
    F.TEST_EP, F.TEST_SEED = 8, 4242


def label(m):
    return "unconstrained" if m is None else f"M={m:.2f}"


def one(args):
    margin, s, k = args
    x0 = [0.5] * 12; x0[2] = M6.STARTS[k]
    es = cma.CMAEvolutionStrategy(x0, 0.25, {"bounds": [0, 1], "seed": 100 * (s + 1) + k, "popsize": 16, "verbose": -9})
    best, bx, n, ninf = -1e9, None, 0, 0
    while n < BUDGET:
        xs = np.array(es.ask())
        if margin is None:
            ys = P.score(xs, TRAIN_EP, M6.TRAIN_SEED + s, dist_sign=F.SIGN, ff=1.0, ff_mode="integ", **M6.cond("aware"))[0]
        else:
            rho = F.margin_rho(xs, margin)
            ok = rho < 1.0
            ys = -100.0 - 10.0 * np.minimum(rho - 1.0, 10.0)
            if ok.any():
                ys[ok] = P.score(xs[ok], TRAIN_EP, M6.TRAIN_SEED + s, dist_sign=F.SIGN, ff=1.0, ff_mode="integ", **M6.cond("aware"))[0]
            ninf += int((~ok).sum())
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return margin, s, k, float(best), bx.tolist(), ninf


def stored():
    """Seeds 0-5 of every arm as milestone 7f stored and scored them: {(label, seed): run}."""
    f = json.load(open(os.path.join(HERE, "..", "m7f_sweep", "results.json")))
    return {(r["label"], r["seed"]): r for r in f["runs"]}, f["train"]


if __name__ == "__main__":
    t0 = time.time()
    old, old_train = stored()
    b7 = [r for r in json.load(open(os.path.join(HERE, "..", "m7b_integ", "results.json")))["runs"]
          if r["label"] == "integ retrained" and r["geom"] == F.GEOM and r["seed"] == 0][0]
    jobs = [(m, s, k) for m in ARMS for s in NEW_SEEDS for k in range(len(M6.STARTS))]
    if not SMOKE:
        jobs = [(1.0, 0, 0), (None, 0, 0), (None, 0, 1)] + jobs
    with Pool() as p:
        train = p.map(one, jobs, chunksize=1)
    checks = []
    if not SMOKE:
        r10 = [t for t in train if t[0] == 1.0 and t[1] == 0 and t[2] == 0][0]
        s10 = [t for t in old_train if t["margin"] == 1.0 and t["seed"] == 0 and t["start"] == 0][0]
        checks.append(("7f M=1.00 seed 0 start 0 best training score", r10[3], s10["best"], r10[3] == s10["best"]))
        u0 = max((t for t in train if t[0] is None and t[1] == 0), key=lambda t: t[3])
        checks.append(("7b unconstrained seed 0 design (max |dx|)", float(np.max(np.abs(np.array(u0[4]) - np.array(b7["x"])))), 0.0,
                       u0[4] == b7["x"]))
        train = [t for t in train if t[1] in NEW_SEEDS]
    ev = []
    for m in ARMS:
        for s in OLD_SEEDS:
            ev.append((label(m), s, old[(label(m), s)]["x"]))
        for s in NEW_SEEDS:
            b = max((t for t in train if t[0] == m and t[1] == s), key=lambda t: t[3])
            ev.append((label(m), s, b[4]))
    with Pool() as p:
        out = p.starmap(F.evaluate, ev)
    if not SMOKE:
        keys = [k for k in out[0] if k.startswith(("J_", "pos_", "dead_"))]
        bad = [(r["label"], r["seed"], k) for r in out if r["seed"] in OLD_SEEDS for k in keys if r[k] != old[(r["label"], r["seed"])][k]]
        checks.append(("re-scored seeds 0-5 equal 7f's stored held-out numbers (mismatches)", len(bad), 0, not bad))
    tag = "_smoke" if SMOKE else ""
    json.dump(dict(arms=[label(m) for m in ARMS], budget=BUDGET, new_seeds=list(NEW_SEEDS), levers=F.LEVERS, caps=F.CAPS,
                   checks=[dict(what=c[0], got=c[1], want=c[2], ok=bool(c[3])) for c in checks],
                   train=[dict(arm=label(t[0]), seed=t[1], start=t[2], best=t[3], x=t[4], rejected=t[5]) for t in train],
                   runs=out, wall_s=time.time() - t0),
              open(os.path.join(HERE, f"results{tag}.json"), "w"), indent=1)
    for c in checks:
        print("CHECK", "ok " if c[3] else "FAIL", c[0], c[1], c[2])
    print(f"wall time {time.time() - t0:.0f} s")
