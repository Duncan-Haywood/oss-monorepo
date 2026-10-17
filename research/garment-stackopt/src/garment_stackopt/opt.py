"""Stack optimiser for angle-stable structural colour (stylised; builds on garment_thincolor).

Objective (minimise): mean dE76 between the colour at each angle in ANGLES and at normal incidence, for a stack of
N alternating hi/lo layers (hi on top) with free thicknesses. Constraints are soft penalties: normal-incidence chroma
C* >= C_MIN and hue within H_TOL degrees of a target hue. Every optimiser gets the same number of objective calls.
"""
import numpy as np

from garment_thincolor.model import WL, delta_e76, lab, quarter_wave_stack, reflectance_unpolarised

N_SUB, N_HI, N_LO = 1.53, 2.4, 1.46
ANGLES = (15.0, 30.0, 45.0)
C_MIN, H_TOL = 40.0, 30.0
D_MIN, D_MAX = 20.0, 250.0  # nm


def build(d, n_hi=N_HI, n_lo=N_LO):
    return [((n_hi if i % 2 == 0 else n_lo), float(t)) for i, t in enumerate(d)]


def colour(d, theta=0.0):
    return lab(reflectance_unpolarised(WL, build(d), N_SUB, theta))


def hue_diff(h1, h2):
    return abs((h1 - h2 + 180.0) % 360.0 - 180.0)


def shift(d):
    """Mean dE76 against normal incidence over ANGLES."""
    c0 = colour(d)
    return float(np.mean([delta_e76(c0, colour(d, a)) for a in ANGLES]))


def objective(d, target_hue):
    c0 = colour(d)
    pen = 5.0 * max(0.0, C_MIN - c0[3]) + 1.0 * max(0.0, hue_diff(c0[4], target_hue) - H_TOL)
    return float(np.mean([delta_e76(c0, colour(d, a)) for a in ANGLES])) + pen, pen


def baseline_stack(lam0, pairs):
    return np.array([t for _, t in quarter_wave_stack(N_HI, N_LO, pairs, lam0)])


class Budget:
    """Wraps the objective, counts calls and tracks best-so-far; raises once the budget is spent."""

    class Done(Exception):
        pass

    def __init__(self, target_hue, evals):
        self.h, self.cap, self.n, self.best, self.bestx = target_hue, evals, 0, np.inf, None

    def __call__(self, d):
        if self.n >= self.cap:
            raise Budget.Done
        self.n += 1
        d = np.clip(np.asarray(d, float), D_MIN, D_MAX)
        v, _ = objective(d, self.h)
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


def diff_evolution(f, dim, rng):
    from scipy.optimize import differential_evolution
    try:
        differential_evolution(f, [(D_MIN, D_MAX)] * dim, popsize=10, maxiter=10 ** 6, tol=0, seed=int(rng.integers(1 << 30)), polish=False)
    except Budget.Done:
        pass


OPTIMISERS = {"random": random_search, "nelder-mead restarts": nelder_mead_restarts, "differential evolution": diff_evolution}
