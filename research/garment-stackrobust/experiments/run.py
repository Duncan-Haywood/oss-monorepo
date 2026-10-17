"""Experiments for garment-stackrobust. Seeded; writes experiments/results.txt."""
import os
import sys

import numpy as np

here = os.path.dirname(__file__)
sys.path[:0] = [os.path.join(here, "..", "src"), os.path.join(here, "..", "..", "garment-stackopt", "src"), os.path.join(here, "..", "..", "garment-thincolor", "src")]
from garment_stackopt.opt import baseline_stack, colour  # noqa: E402
from garment_stackrobust.rob import CostBudget, evaluate, nelder_mead_restarts, random_search  # noqa: E402

COST, SEEDS, N_LAYERS, K, N_EVAL = 3000, 10, 8, 6, 200
SIGMAS = (0.03, 0.05)
METHODS = {"random": random_search, "Nelder-Mead restarts": nelder_mead_restarts}
eval_draws = np.random.default_rng(777).standard_normal((N_EVAL, N_LAYERS))  # held out: never seen by any optimiser
out = []


def p(s=""):
    out.append(s)
    print(s)


p(f"Cost {COST} stack evaluations per run, {SEEDS} seeds, {N_LAYERS} layers. Robust objective = mean over K={K} fixed thickness-error draws.")
p(f"Evaluation: {N_EVAL} held-out draws, layer thickness d*(1+sigma*eps), eps~N(0,1) per layer. Medians over seeds.")
p("cols: nominal J (no error) | mean J under error | share of draws feasible (C*>=40, hue within 30 deg) | mean dE76 drift of normal colour\n")
for lam in (620, 450):
    base = baseline_stack(lam, N_LAYERS // 2)
    th = colour(base)[4]
    designs = {"quarter-wave": [base]}
    for name, fn in METHODS.items():
        ds = []
        for s in range(SEEDS):
            f = CostBudget(th, COST)
            fn(f, N_LAYERS, np.random.default_rng(1000 * lam + s))
            ds.append(f.bestx)
        designs[f"{name}, nominal"] = ds
    for sg in SIGMAS:
        for name, fn in METHODS.items():
            ds = []
            for s in range(SEEDS):
                rng = np.random.default_rng(5000 * lam + 100 * s + int(sg * 1000))
                f = CostBudget(th, COST, sigma=sg, draws=rng.standard_normal((K, N_LAYERS)))
                fn(f, N_LAYERS, rng)
                ds.append(f.bestx)
            designs[f"{name}, robust sigma={sg:.2f}"] = ds
    p(f"== target: quarter-wave stack designed at {lam} nm (hue {th:.0f})")
    for sg in SIGMAS:
        p(f"-- evaluated at sigma = {sg:.2f}")
        p(f"{'design':>38s}  {'nominal J':>9s} {'mean J':>7s} {'feasible':>8s} {'drift':>6s}")
        for name, ds in designs.items():
            if "robust" in name and f"sigma={sg:.2f}" not in name:
                continue
            r = [evaluate(d, th, sg, eval_draws) for d in ds]
            m = lambda k: np.median([x[k] for x in r])
            p(f"{name:>38s}  {m('nominal_J'):9.2f} {m('mean_J'):7.2f} {m('feasible'):8.2f} {m('drift'):6.1f}")
    p("")
with open(os.path.join(here, "results.txt"), "w") as fh:
    fh.write("\n".join(out) + "\n")
