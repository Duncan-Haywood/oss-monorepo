"""Joint elicitation of (VaR, expected shortfall) for positive losses X (e.g. benign-drift magnitude). Stdlib only.

Upper-tail level alpha: v = VaR = q_alpha(X), e = ES = E[X | X >= v] = v + E[(X-v)+]/(1-alpha).
Score (Fissler-Ziegel family with G1 = 0, G2 = -ln, positive losses):
    S(v, e; x) = ln e + (v + (x - v)+/(1-alpha)) / e - 1.
With c(v) = v + E[(X-v)+]/(1-alpha) (Rockafellar-Uryasev), E S(v, e) = ln e + c(v)/e - 1, and min_v c(v) = ES at v = VaR.
"""
import math, random

__all__ = ["score", "ru", "var_es", "expected_score", "excess_score", "es_excess_factor",
           "pareto_var_es", "pareto_ru", "expo_var_es", "expo_ru", "pareto_y_var", "pareto_sample",
           "detect_n", "es_estimate", "mixture", "tail_gap_profile"]


def score(v, e, x, alpha):
    return math.log(e) + (v + max(x - v, 0.0) / (1 - alpha)) / e - 1.0


# ---- finite distributions: list of (x, prob) ----
def ru(atoms, alpha, v):
    """c(v) = v + E[(X-v)+]/(1-alpha)."""
    return v + sum(p * max(x - v, 0.0) for x, p in atoms) / (1 - alpha)


def var_es(atoms, alpha):
    """(VaR, ES) of a finite distribution; c(v) is piecewise linear so its minimum sits on an atom."""
    best = min((ru(atoms, alpha, x), x) for x, _ in atoms)
    return best[1], best[0]


def expected_score(atoms, v, e, alpha):
    return math.log(e) + ru(atoms, alpha, v) / e - 1.0


def mixture(a, b, w):
    d = {}
    for x, p in a:
        d[x] = d.get(x, 0.0) + w * p
    for x, p in b:
        d[x] = d.get(x, 0.0) + (1 - w) * p
    return sorted(d.items())


# ---- closed-form laws ----
def excess_score(v, e, v_star, e_star, cv):
    """E S(v,e) - E S(v*,e*) = [ln(e/e*) + e*/e - 1] + (c(v) - e*)/e, given c(v)."""
    return math.log(e / e_star) + e_star / e - 1.0 + (cv - e_star) / e


def es_excess_factor(r):
    """Scale-free penalty for reporting ES at r times its true value (VaR truthful): ln r + 1/r - 1."""
    return math.log(r) + 1.0 / r - 1.0


# Pareto(a) on [1, inf): F = 1 - x^-a
def pareto_var_es(a, alpha):
    v = (1 - alpha) ** (-1.0 / a)
    return v, (v * a / (a - 1) if a > 1 else math.inf)


def pareto_ru(a, alpha, v):
    return v + (v ** (1 - a) / (a - 1) if v >= 1 else (1 - v) + 1 / (a - 1)) / (1 - alpha)


def pareto_y_var(a, alpha):
    """Var of Y = v + (X-v)+/(1-alpha) under Pareto(a) with v = VaR (finite iff a > 2)."""
    if a <= 2:
        return math.inf
    v = (1 - alpha) ** (-1.0 / a)
    # E[(X-v)+^2] = 2 v^(2-a) / ((a-1)(a-2)); E[(X-v)+] = v^(1-a)/(a-1)
    m1 = v ** (1 - a) / (a - 1)
    m2 = 2 * v ** (2 - a) / ((a - 1) * (a - 2))
    d = 1 - alpha
    # Y = v w.p. alpha, v + Z/d else with Z=(X-v)+ (Z=0 with prob alpha)
    ey = v + m1 / d
    ey2 = v * v + 2 * v * m1 / d + m2 / d ** 2
    return ey2 - ey * ey


def pareto_sample(a, rng):
    return (1.0 - rng.random()) ** (-1.0 / a)


# Exponential(1)
def expo_var_es(alpha):
    v = -math.log(1 - alpha)
    return v, v + 1.0


def expo_ru(alpha, v):
    return v + math.exp(-v) / (1 - alpha)


def detect_n(var_y, e_true, r, z_size=1.6449, z_power=0.8416):
    """Reports needed (CLT, one-sided) to tell a report r*e_true from the honest e_true, VaR truthful.
    d = S(v, r e) - S(v, e) has mean ln r + 1/r - 1 and sd sqrt(var_y) * |1/(r e) - 1/e|."""
    m = es_excess_factor(r)
    sd = math.sqrt(var_y) * abs(1 / (r * e_true) - 1 / e_true)
    return ((z_size + z_power) * sd / m) ** 2


def es_estimate(xs, alpha):
    """Plug-in ES: sample RU minimiser, i.e. mean of the top ceil(n(1-alpha)) order statistics (with fractional weight)."""
    n = len(xs)
    s = sorted(xs, reverse=True)
    k = n * (1 - alpha)
    kf = int(k)
    tot = sum(s[:kf]) + (k - kf) * (s[kf] if kf < n else 0.0)
    return tot / k


def tail_gap_profile(atoms, alpha, grid):
    """(v, c(v) - ES) over a grid: nonnegative, zero exactly at VaR."""
    _, es = var_es(atoms, alpha)
    return [(v, ru(atoms, alpha, v) - es) for v in grid]
