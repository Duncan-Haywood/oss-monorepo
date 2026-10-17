"""Constrained angle-shift minimisation over a grid of chroma floors and mass caps (stylised; builds on garment_stackopt).

For each (C_floor, mass_cap) cell the objective is mean dE76 over ANGLES plus soft penalties: 5 per C* unit below the
floor, 1 per degree of hue error beyond H_TOL, and 20 per g/m2 of oxide mass above the cap. Nelder-Mead with random
restarts (the best optimiser in garment-stackopt) gets a fixed number of calls per run.
"""
import numpy as np

from garment_stackopt.opt import ANGLES, D_MAX, D_MIN, H_TOL, N_HI, N_LO, Budget, build, colour, hue_diff
from garment_thincolor.model import areal_mass_g_m2, delta_e76

N_LAYERS = 8
RHO = [4230.0, 2200.0] * (N_LAYERS // 2)
W_C, W_H, W_M = 5.0, 1.0, 20.0


def mass(d):
    return areal_mass_g_m2(build(d), RHO)


def metrics(d, target_hue):
    c0 = colour(d)
    sh = float(np.mean([delta_e76(c0, colour(d, a)) for a in ANGLES]))
    return sh, float(c0[3]), hue_diff(c0[4], target_hue), mass(d)


def penalised(d, target_hue, c_floor, m_cap):
    sh, c, hd, m = metrics(d, target_hue)
    return sh + W_C * max(0.0, c_floor - c) + W_H * max(0.0, hd - H_TOL) + W_M * max(0.0, m - m_cap)


def feasible(d, target_hue, c_floor, m_cap, tol=1e-9):
    _, c, hd, m = metrics(d, target_hue)
    return c >= c_floor - tol and hd <= H_TOL + tol and m <= m_cap + tol


class CellBudget(Budget):
    def __init__(self, target_hue, evals, c_floor, m_cap):
        super().__init__(target_hue, evals)
        self.cf, self.mc = c_floor, m_cap

    def __call__(self, d):
        if self.n >= self.cap:
            raise Budget.Done
        self.n += 1
        d = np.clip(np.asarray(d, float), D_MIN, D_MAX)
        v = penalised(d, self.h, self.cf, self.mc)
        if v < self.best:
            self.best, self.bestx = v, d.copy()
        return v


def solve_cell(target_hue, c_floor, m_cap, evals, seed):
    from scipy.optimize import minimize
    f, rng = CellBudget(target_hue, evals, c_floor, m_cap), np.random.default_rng(seed)
    try:
        while True:
            minimize(f, rng.uniform(D_MIN, D_MAX, N_LAYERS), method="Nelder-Mead",
                     options={"xatol": 0.1, "fatol": 1e-3, "maxfev": 400})
    except Budget.Done:
        pass
    return f.bestx


def pareto_mask(points):
    """Non-dominated rows of an (n, k) array, all columns to be minimised."""
    p = np.asarray(points, float)
    keep = np.ones(len(p), bool)
    for i in range(len(p)):
        dom = np.all(p <= p[i], axis=1) & np.any(p < p[i], axis=1)
        if dom.any():
            keep[i] = False
    return keep
