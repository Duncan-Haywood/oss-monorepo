"""Experiments for garment-stackcvar. Seeded; writes experiments/results.txt."""
import os
import sys
import time

import numpy as np

here = os.path.dirname(__file__)
r = os.path.join(here, "..", "..")
sys.path[:0] = [os.path.join(here, "..", "src")] + [os.path.join(r, p, "src") for p in ("garment-stackrobust", "garment-stackopt", "garment-thincolor")]
from garment_stackcvar.cvar import Budget, draws, evaluate, nelder_mead_restarts, random_search  # noqa: E402
from garment_stackopt.opt import baseline_stack, colour  # noqa: E402

COST, SEEDS, N_LAYERS, K, N_EVAL, SIGMA, RHO = 3000, 8, 8, 8, 200, 0.05, 0.5
METHODS = {"random": random_search, "Nelder-Mead": nelder_mead_restarts}
TRAIN = {"mean/iid": ("mean", 0.0), "CVaR25/iid": ("cvar", 0.0), "mean/corr": ("mean", RHO), "CVaR25/corr": ("cvar", RHO)}
EVAL = {"iid": 0.0, f"corr(rho={RHO})": RHO}
eval_eps = {k: draws(np.random.default_rng(777), N_EVAL, N_LAYERS, v) for k, v in EVAL.items()}  # held out
out = []


def p(s=""):
    out.append(s)
    print(s, flush=True)


p(f"Cost {COST} stack evaluations per run, {SEEDS} seeds, {N_LAYERS} layers, K={K} training draws, sigma={SIGMA}, CVaR25 = mean of worst 2 of {K}.")
p(f"Evaluation: {N_EVAL} held-out draws per error model. Medians over seeds. cols: mean J | 90th-percentile J | share feasible (C*>=40, hue within 30 deg)\n")
t0 = time.time()
for lam in (620, 450):
    base = baseline_stack(lam, N_LAYERS // 2)
    th = colour(base)[4]
    designs = {"quarter-wave": [base]}
    for mname, fn in METHODS.items():
        for tname, (kind, rho) in TRAIN.items():
            ds = []
            for s in range(SEEDS):
                rng = np.random.default_rng(9000 * lam + 100 * s + 7)
                f = Budget(th, COST, SIGMA, draws(rng, K, N_LAYERS, rho), kind)
                fn(f, N_LAYERS, rng)
                ds.append(f.bestx)
            designs[f"{mname}, {tname}"] = ds
    p(f"== target: quarter-wave stack designed at {lam} nm (hue {th:.0f})")
    for ename, eps in eval_eps.items():
        p(f"-- evaluated under {ename} errors")
        p(f"{'design':>26s}  {'mean J':>7s} {'p90 J':>7s} {'feasible':>8s}")
        for name, ds in designs.items():
            res = [evaluate(d, th, SIGMA, eps) for d in ds]
            m = lambda k: np.median([x[k] for x in res])
            p(f"{name:>26s}  {m('mean_J'):7.2f} {m('p90_J'):7.2f} {m('feasible'):8.2f}")
    p("")
p(f"(runtime {time.time() - t0:.0f} s)")
with open(os.path.join(here, "results.txt"), "w") as fh:
    fh.write("\n".join(out) + "\n")
