"""Fine-tuning a twin-pretrained policy on the real plant (stylised quadratic).

Real loss L(th) = 1/2 sum_i lam_i e_i^2, e = th - th*.  Constant-step SGD on real
data: e_i <- e_i - eta (lam_i e_i + s xi),  xi ~ N(0,1).  With r_i = 1 - eta lam_i,
  E e_i(k)^2 = r_i^(2k) e_i(0)^2 + eta s^2 / (lam_i (2 - eta lam_i)) (1 - r_i^(2k)).
"""
import math, random

__all__ = ["floor", "risk", "risk_sim", "steps_to", "steps_saved", "worst_direction",
           "residual_bound", "crossover_ratio", "spectrum"]


def spectrum(d, kappa):
    """d eigenvalues geometrically spaced in [1/kappa, 1]."""
    if d == 1:
        return [1.0]
    return [kappa ** (-(1 - i / (d - 1))) for i in range(d)]


def floor(lams, eta, s):
    """Stationary SGD excess loss: 1/2 sum eta s^2 / (2 - eta lam)."""
    return 0.5 * sum(eta * s * s / (2 - eta * l) for l in lams)


def risk(lams, e0, eta, s, k):
    """Exact expected real loss after k SGD steps from error vector e0."""
    tot = 0.0
    for l, e in zip(lams, e0):
        r2k = (1 - eta * l) ** (2 * k)
        tot += 0.5 * l * (r2k * e * e + eta * s * s / (l * (2 - eta * l)) * (1 - r2k))
    return tot


def risk_sim(lams, e0, eta, s, k, runs, seed=0):
    rng = random.Random(seed)
    tot = 0.0
    for _ in range(runs):
        e = list(e0)
        for _ in range(k):
            e = [x - eta * (l * x + s * rng.gauss(0, 1)) for x, l in zip(e, lams)]
        tot += 0.5 * sum(l * x * x for l, x in zip(lams, e))
    return tot / runs


def steps_to(lams, e0, eta, s, target, kmax=10 ** 6):
    """Smallest k with risk <= target (risk is monotone decreasing when e0 is above the floor);
    returns None if the target is below the floor. Doubling + bisection."""
    if risk(lams, e0, eta, s, 0) <= target:
        return 0
    if target <= floor(lams, eta, s):
        return None
    hi = 1
    while risk(lams, e0, eta, s, hi) > target:
        hi *= 2
        if hi > kmax:
            return None
    lo = hi // 2
    while hi - lo > 1:
        m = (lo + hi) // 2
        if risk(lams, e0, eta, s, m) > target:
            lo = m
        else:
            hi = m
    return hi


def steps_saved(lams, e_twin, e_cold, eta, s, target):
    kc = steps_to(lams, e_cold, eta, s, target)
    kw = steps_to(lams, e_twin, eta, s, target)
    return None if kc is None or kw is None else kc - kw


def worst_direction(eta, k):
    """Eigenvalue that maximises the residual lam*r^(2k): lam ~ 1/(2 eta k) (continuous limit)."""
    return 1.0 / (2 * eta * k)


def residual_bound(b2, eta, k):
    """Bias part of the loss after k steps, for ANY spectrum (r^(2k) <= exp(-2 eta lam k)):
    1/2 sum lam_i r_i^(2k) b_i^2 <= b2 / (4 e eta k), b2 = sum b_i^2."""
    return b2 / (4 * math.e * eta * k)


def crossover_ratio():
    """Warm start beats a cold start (isotropic error norms, same spectrum) iff |b| < |e0|."""
    return 1.0
