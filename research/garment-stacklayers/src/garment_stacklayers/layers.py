"""Layer-count sweep for the constrained angle-shift problem of garment-stackpareto (stylised).

Same objective, penalties and optimiser as garment_stackpareto.front, but the number of layers N is a parameter
(alternating hi/lo, hi on top, hi = TiO2-like 4230 kg/m3, lo = SiO2-like 2200 kg/m3).
"""
import numpy as np

from garment_stackopt.opt import ANGLES, D_MAX, D_MIN, H_TOL, Budget, build, colour, hue_diff
from garment_stackpareto.front import W_C, W_H, W_M
from garment_thincolor.model import areal_mass_g_m2, delta_e76


def rho(n):
    return [4230.0, 2200.0] * (n // 2) + ([4230.0] if n % 2 else [])


def metrics(d, target_hue):
    d = np.asarray(d, float)
    c0 = colour(d)
    sh = float(np.mean([delta_e76(c0, colour(d, a)) for a in ANGLES]))
    return sh, float(c0[3]), hue_diff(c0[4], target_hue), areal_mass_g_m2(build(d), rho(len(d)))


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


def solve(n_layers, target_hue, c_floor, m_cap, evals, seed):
    from scipy.optimize import minimize
    f, rng = CellBudget(target_hue, evals, c_floor, m_cap), np.random.default_rng(seed)
    try:
        while True:
            minimize(f, rng.uniform(D_MIN, D_MAX, n_layers), method="Nelder-Mead",
                     options={"xatol": 0.1, "fatol": 1e-3, "maxfev": 400})
    except Budget.Done:
        pass
    return f.bestx
