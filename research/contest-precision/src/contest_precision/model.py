"""Training contests scored on a noisy holdout. Stdlib only.

n contestants each choose effort e_i (true quality e_i, cost e_i^2/2). The organiser
scores each on a holdout: s_i = e_i + sigma*eps_i, eps_i iid N(0,1), sigma = s/sqrt(m) for
m holdout samples. Highest score takes the prize V. Everything depends on lam = V/sigma^2.
"""
import math, random

__all__ = ["phi", "Phi", "a_n", "win_prob", "eq_effort", "utility", "best_response",
           "deviation_gap", "lam_max", "lam_participation", "mc_win_prob", "principal_value",
           "best_m"]

_SQ2PI = math.sqrt(2 * math.pi)


def phi(z):
    return math.exp(-0.5 * z * z) / _SQ2PI


def Phi(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def _simpson(f, lo=-9.0, hi=9.0, n=1800):
    h = (hi - lo) / n
    s = f(lo) + f(hi)
    for i in range(1, n):
        s += (4 if i % 2 else 2) * f(lo + i * h)
    return s * h / 3


def a_n(n):
    """W'(0) = (n-1) * int phi^2 Phi^(n-2): slope of win probability in own effort/sigma at symmetry."""
    return (n - 1) * _simpson(lambda z: phi(z) ** 2 * Phi(z) ** (n - 2))


def win_prob(d, n):
    """P(win) when own effort exceeds every rival's by d sigma-units (rivals symmetric)."""
    return _simpson(lambda z: phi(z) * Phi(z + d) ** (n - 1))


def eq_effort(V, sigma, n):
    """First-order-condition effort V*a_n/sigma (a candidate symmetric equilibrium)."""
    return V * a_n(n) / sigma


def utility(e, e_rival, V, sigma, n):
    return V * win_prob((e - e_rival) / sigma, n) - e * e / 2


def best_response(e_rival, V, sigma, n, grid=400, hi_mult=4.0):
    """Global best response to rivals all at e_rival, by grid search then refinement."""
    top = hi_mult * max(e_rival, sigma, math.sqrt(2 * V))
    best_e, best_u = 0.0, utility(0.0, e_rival, V, sigma, n)
    for i in range(1, grid + 1):
        e = top * i / grid
        u = utility(e, e_rival, V, sigma, n)
        if u > best_u:
            best_e, best_u = e, u
    return best_e, best_u


def deviation_gap(V, sigma, n):
    """Largest gain from deviating away from the FOC effort (<= ~0 means it is a pure equilibrium)."""
    e = eq_effort(V, sigma, n)
    _, u = best_response(e, V, sigma, n)
    return u - utility(e, e, V, sigma, n)


def lam_max(n, tol=1e-9, gap_tol=1e-9):
    """Largest lam=V/sigma^2 for which the FOC effort is a global best response (bisection;
    checked monotone on a coarse grid first). Above it no symmetric pure equilibrium at FOC effort."""
    ok = lambda lam: deviation_gap(lam, 1.0, n) <= gap_tol
    lo, hi = 1e-6, 1.0
    while ok(hi) and hi < 1e4:
        lo, hi = hi, hi * 2
    while hi - lo > tol * max(1.0, hi):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if ok(mid) else (lo, mid)
    return lo


def lam_participation(n):
    """lam at which equilibrium rent V/n - e^2/2 hits zero: 2/(n a_n^2)."""
    return 2 / (n * a_n(n) ** 2)


def mc_win_prob(d, n, trials=200000, seed=0):
    rng = random.Random(seed)
    w = 0
    for _ in range(trials):
        mine = d + rng.gauss(0, 1)
        if all(rng.gauss(0, 1) < mine for _ in range(n - 1)):
            w += 1
    return w / trials


def principal_value(V, m, s, n, kappa, w=1.0):
    """Organiser utility w*e* - V - kappa*m (w = value per unit of winning quality) at holdout size m
    (sigma = s/sqrt(m)), valid only inside the pure-equilibrium region; None outside it."""
    sigma = s / math.sqrt(m)
    if V / sigma ** 2 > lam_max(n):
        return None
    return w * eq_effort(V, sigma, n) - V - kappa * m


def best_m(V, s, n, kappa, w=1.0):
    """Optimum m* = min(m_cap, (w V a/(2 s kappa))^2) with m_cap = lam_max s^2/V."""
    a = a_n(n)
    m_cap = lam_max(n) * s * s / V
    m_free = (w * V * a / (2 * s * kappa)) ** 2
    return min(m_cap, m_free), m_cap, m_free
