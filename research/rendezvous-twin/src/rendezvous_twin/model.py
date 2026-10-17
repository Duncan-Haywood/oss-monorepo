"""Rendezvous planning for a multi-robot mapping team.  Each robot dead-reckons; its position error variance
t time units after the last correction (a rendezvous / loop closure that resets the error) is
    V(t) = s2 t + b2 t^2
where s2 t is white odometry noise (random walk) and b2 t^2 is a per-run constant bias rate (calibration error,
slip, gyro bias) with variance b2.  The twin, fitted on short-horizon increments, sees only s2 t."""
import math, random

__all__ = ["V", "twin_interval", "cost_rate", "real_interval", "regret", "budget_interval_twin",
           "budget_interval_real", "peak_ratio", "violation_fraction", "relative_b2", "pair_V",
           "fit_two_lag", "simulate_V"]


def V(t, s2, b2):
    return s2 * t + b2 * t * t


def cost_rate(T, c, lam, s2, b2):
    """Long-run cost per unit time of rendezvous every T: c/T + lam * mean_{[0,T]} V."""
    return c / T + lam * (s2 * T / 2 + b2 * T * T / 3)


def twin_interval(c, lam, s2):
    """argmin of c/T + lam s2 T/2."""
    return math.sqrt(2 * c / (lam * s2))


def real_interval(c, lam, s2, b2):
    """Root of (2/3) lam b2 T^3 + (lam s2/2) T^2 = c  (stationarity of cost_rate), by bisection."""
    f = lambda T: (2 / 3) * lam * b2 * T ** 3 + lam * s2 * T * T / 2 - c
    lo, hi = 0.0, twin_interval(c, lam, s2)
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if f(mid) < 0 else (lo, mid)
    return (lo + hi) / 2


def regret(T, c, lam, s2, b2):
    """Relative excess real cost rate of interval T over the real optimum."""
    return cost_rate(T, c, lam, s2, b2) / cost_rate(real_interval(c, lam, s2, b2), c, lam, s2, b2) - 1


def budget_interval_twin(eps, s2):
    """Longest interval whose peak error std stays within eps in the twin: s2 T = eps^2."""
    return eps * eps / s2


def budget_interval_real(eps, s2, b2):
    """Longest interval with s2 T + b2 T^2 <= eps^2."""
    if b2 == 0:
        return eps * eps / s2
    return (-s2 + math.sqrt(s2 * s2 + 4 * b2 * eps * eps)) / (2 * b2)


def peak_ratio(T, s2, b2):
    """Real peak error std at interval T over the twin's claim sqrt(s2 T) = sqrt(1 + b2 T / s2)."""
    return math.sqrt(1 + b2 * T / s2)


def violation_fraction(T, eps, s2, b2):
    """Fraction of a cycle of length T during which the real error std exceeds eps."""
    return max(0.0, 1 - budget_interval_real(eps, s2, b2) / T)


def relative_b2(b2, kappa):
    """Pairwise relative frame of two robots whose bias rates have correlation kappa:
    V_rel(t) = 2 s2 t + 2 (1-kappa) b2 t^2, i.e. (s2, b2) -> (2 s2, 2 (1-kappa) b2)."""
    return 2 * (1 - kappa) * b2


def pair_V(t, s2, b2, kappa):
    return V(t, 2 * s2, relative_b2(b2, kappa))


def fit_two_lag(vshort, lshort, vlong, llong):
    """Method-of-moments (s2, b2) from error variances at a short and a long lag; b2 clipped at 0."""
    s2 = vshort / lshort
    b2 = max(0.0, (vlong - s2 * llong) / (llong * llong))
    return s2, b2


def simulate_V(t, s2, b2, n, rng):
    """Monte Carlo variance of dead-reckoned error at integer lag t: per-run bias rate ~ N(0,b2), plus t iid N(0,s2)
    steps.  Returns (estimate, standard error)."""
    xs = []
    for _ in range(n):
        b = rng.gauss(0, math.sqrt(b2))
        e = sum(rng.gauss(0, math.sqrt(s2)) for _ in range(t)) + b * t
        xs.append(e * e)
    m = sum(xs) / n
    se = math.sqrt(sum((x - m) ** 2 for x in xs) / n / n)
    return m, se
