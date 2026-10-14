"""Thickness-error robustness for angle-stable stacks (stylised; builds on garment_stackopt and garment_thincolor).

A stack d is fabricated as d * (1 + sigma * eps), eps ~ N(0, 1) independently per layer. Robust objective: mean of the
garment_stackopt objective over K fixed (common-random-number) draws. Evaluation uses a separate held-out set of draws.
Cost is counted in stack evaluations (one objective call = one stack evaluation for the nominal objective, K for the
robust one), so every optimiser gets the same total cost.
"""
import numpy as np

from garment_stackopt.opt import C_MIN, D_MAX, D_MIN, H_TOL, colour, hue_diff, objective
from garment_thincolor.model import delta_e76


def perturb(d, eps, sigma):
    return np.clip(np.asarray(d, float) * (1.0 + sigma * eps), 1.0, None)


class CostBudget:
    """Counts stack evaluations; `f(d)` returns the mean objective over `draws` (None = nominal only)."""

    class Done(Exception):
        pass

    def __init__(self, target_hue, cost, sigma=0.0, draws=None):
        self.h, self.cap, self.sigma, self.draws = target_hue, cost, sigma, draws
        self.n, self.best, self.bestx = 0, np.inf, None
        self.k = 1 if draws is None else len(draws)

    def __call__(self, d):
        if self.n + self.k > self.cap:
            raise CostBudget.Done
        self.n += self.k
        d = np.clip(np.asarray(d, float), D_MIN, D_MAX)
        if self.draws is None:
            v, _ = objective(d, self.h)
        else:
            v = float(np.mean([objective(perturb(d, e, self.sigma), self.h)[0] for e in self.draws]))
        if v < self.best:
            self.best, self.bestx = v, d.copy()
        return v


def random_search(f, dim, rng):
    try:
        while True:
            f(rng.uniform(D_MIN, D_MAX, dim))
    except CostBudget.Done:
        pass


def nelder_mead_restarts(f, dim, rng):
    from scipy.optimize import minimize
    try:
        while True:
            minimize(f, rng.uniform(D_MIN, D_MAX, dim), method="Nelder-Mead", options={"xatol": 0.1, "fatol": 1e-3, "maxfev": 400})
    except CostBudget.Done:
        pass


def evaluate(d, target_hue, sigma, eval_draws):
    """Held-out metrics of design d under thickness error sigma.

    Returns dict: nominal J; mean J over draws; share of draws feasible (C* >= C_MIN and hue within H_TOL, both at
    normal incidence); mean dE76 drift of the normal-incidence colour from the nominal design's.
    """
    c0 = colour(d)
    j0, _ = objective(d, target_hue)
    js, feas, drift = [], [], []
    for e in eval_draws:
        dp = perturb(d, e, sigma)
        j, pen = objective(dp, target_hue)
        js.append(j)
        c = colour(dp)
        feas.append(c[3] >= C_MIN and hue_diff(c[4], target_hue) <= H_TOL)
        drift.append(delta_e76(c0, c))
    return {"nominal_J": j0, "mean_J": float(np.mean(js)), "feasible": float(np.mean(feas)), "drift": float(np.mean(drift))}
