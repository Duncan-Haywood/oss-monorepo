"""CVaR and correlated-error objectives for thin-film stacks (stylised; builds on garment_stackrobust).

Error models for a stack d (fabricated = d * (1 + sigma * eps)):
  iid:  eps_i ~ N(0,1) independent per layer (as in garment_stackrobust).
  corr: eps_i = sqrt(rho) * z + sqrt(1 - rho) * e_i, z shared by all layers (a deposition-rate drift), e_i independent;
        each eps_i is still N(0,1), so sigma keeps its meaning and only the correlation changes.
Objectives over K fixed draws: "mean" of the garment_stackopt objective, or "cvar" = mean of the worst ceil(alpha*K).
"""
import math

import numpy as np

from garment_stackopt.opt import C_MIN, D_MAX, D_MIN, H_TOL, colour, hue_diff, objective
from garment_stackrobust.rob import perturb


def draws(rng, n, dim, rho):
    z = rng.standard_normal((n, 1))
    e = rng.standard_normal((n, dim))
    return np.sqrt(rho) * z + np.sqrt(1.0 - rho) * e


def aggregate(values, kind, alpha=0.25):
    v = np.sort(np.asarray(values, float))
    if kind == "mean":
        return float(v.mean())
    if kind == "cvar":
        k = max(1, math.ceil(alpha * len(v)))
        return float(v[-k:].mean())
    raise ValueError(kind)


class Budget:
    """Counts stack evaluations (K per call); stops by raising Done when the cap would be exceeded."""

    class Done(Exception):
        pass

    def __init__(self, target_hue, cost, sigma, eps_draws, kind="mean", alpha=0.25):
        self.h, self.cap, self.sigma, self.eps, self.kind, self.alpha = target_hue, cost, sigma, eps_draws, kind, alpha
        self.n, self.best, self.bestx = 0, np.inf, None

    def __call__(self, d):
        if self.n + len(self.eps) > self.cap:
            raise Budget.Done
        self.n += len(self.eps)
        d = np.clip(np.asarray(d, float), D_MIN, D_MAX)
        v = aggregate([objective(perturb(d, e, self.sigma), self.h)[0] for e in self.eps], self.kind, self.alpha)
        if v < self.best:
            self.best, self.bestx = v, d.copy()
        return v


def random_search(f, dim, rng):
    try:
        while True:
            f(rng.uniform(D_MIN, D_MAX, dim))
    except Budget.Done:
        pass


def nelder_mead_restarts(f, dim, rng):
    from scipy.optimize import minimize
    try:
        while True:
            minimize(f, rng.uniform(D_MIN, D_MAX, dim), method="Nelder-Mead", options={"xatol": 0.1, "fatol": 1e-3, "maxfev": 400})
    except Budget.Done:
        pass


def evaluate(d, target_hue, sigma, eval_eps):
    """Held-out metrics: mean J, 90th-percentile J, and share of draws feasible at normal incidence."""
    js, feas = [], []
    for e in eval_eps:
        dp = perturb(d, e, sigma)
        js.append(objective(dp, target_hue)[0])
        c = colour(dp)
        feas.append(c[3] >= C_MIN and hue_diff(c[4], target_hue) <= H_TOL)
    return {"mean_J": float(np.mean(js)), "p90_J": float(np.percentile(js, 90)), "feasible": float(np.mean(feas))}
