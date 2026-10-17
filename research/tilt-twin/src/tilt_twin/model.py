"""Rare failure of a twin: S = X_1+...+X_n, X_i ~ N(0,1) i.i.d. disturbances, failure iff S > b.

Exact p = Q(b/sqrt(n)). Mean-shift importance sampling draws X_i ~ N(theta,1) and weights
w = exp(-theta*S + n*theta^2/2).  S is sufficient, so S ~ N(n*theta, n) is sampled directly.
"""
import math
import random


def Q(x):
    return 0.5 * math.erfc(x / math.sqrt(2.0))


def p_true(b, n):
    return Q(b / math.sqrt(n))


def naive_relvar(p, N):
    """Squared relative error of the plain estimate from N runs."""
    return (1 - p) / (N * p)


def second_moment(b, n, theta):
    """E_theta[1{S>b} w^2] = exp(n theta^2) Q((b + n theta)/sqrt(n))  (exact)."""
    return math.exp(n * theta * theta) * Q((b + n * theta) / math.sqrt(n))


def is_relvar(b, n, theta, N=1):
    """Squared relative error of the IS estimate from N runs (exact)."""
    p = p_true(b, n)
    return (second_moment(b, n, theta) / p ** 2 - 1.0) / N


def optimal_theta(b, n, lo=0.0, hi=None, iters=200):
    """theta minimising the exact second moment (golden-section on log M2; it is log-convex)."""
    hi = 2.0 * b / n if hi is None else hi

    def f(t):
        return math.log(second_moment(b, n, t)) if second_moment(b, n, t) > 0 else 1e300

    g = (math.sqrt(5) - 1) / 2
    a, c = lo, hi
    x1, x2 = c - g * (c - a), a + g * (c - a)
    f1, f2 = f(x1), f(x2)
    for _ in range(iters):
        if f1 < f2:
            c, x2, f2 = x2, x1, f1
            x1 = c - g * (c - a)
            f1 = f(x1)
        else:
            a, x1, f1 = x1, x2, f2
            x2 = a + g * (c - a)
            f2 = f(x2)
    return 0.5 * (a + c)


def run_is(b, n, theta, N, rng):
    """N IS samples; returns the list of weighted indicators."""
    out = []
    s_mu, s_sd = n * theta, math.sqrt(n)
    for _ in range(N):
        s = rng.gauss(s_mu, s_sd)
        out.append(math.exp(-theta * s + n * theta * theta / 2.0) if s > b else 0.0)
    return out


def estimate(vals, z=1.96):
    """Mean and normal-approximation confidence interval (sample std)."""
    N = len(vals)
    m = sum(vals) / N
    v = sum((x - m) ** 2 for x in vals) / (N - 1)
    h = z * math.sqrt(v / N)
    return m, m - h, m + h


def ess(vals):
    """Kish effective sample size of the nonzero (failure) weights."""
    w = [x for x in vals if x > 0]
    if not w:
        return 0.0
    return sum(w) ** 2 / sum(x * x for x in w)


def n_for_relerr(relerr, relvar_one):
    """Runs needed for a target relative standard error, given the one-run relative variance."""
    return relvar_one / relerr ** 2
