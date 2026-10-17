"""Errors-in-variables twin.  Real plant: y = a*u + w, u ~ N(0,su2), w ~ N(0,sw2).
The twin builder only logs a noisy measurement of the input, x = u + v, v ~ N(0,sv2), and fits the gain by OLS of y on x.

Population facts (Gaussian): plim OLS = a*lam with reliability lam = su2/(su2+sv2); the OLS residual
e = (a-b)u + w - b v is uncorrelated with x, hence independent of it, so Var(b_hat) ~ Var(e)/(n*sx2).
"""
import math
import random


def reliability(su2, sv2):
    return su2 / (su2 + sv2)


def plim_ols(a, su2, sv2):
    return a * reliability(su2, sv2)


def plim_corrected(a, su2, sv2, sv2_assumed):
    """Method-of-moments gain cov(x,y)/(var(x) - sv2_assumed) when the noise variance is misjudged."""
    return a * su2 / (su2 + sv2 - sv2_assumed)


def ols_var(a, su2, sv2, sw2, n):
    """Leading-order variance of the OLS gain (residual independent of the regressor)."""
    lam = reliability(su2, sv2)
    b = a * lam
    var_e = (a - b) ** 2 * su2 + sw2 + b * b * sv2
    return var_e / (n * (su2 + sv2))


def simulate(n, a, su2, sv2, sw2, rng, second=False):
    x, x2, y = [], [], []
    for _ in range(n):
        u = rng.gauss(0, math.sqrt(su2))
        y.append(a * u + rng.gauss(0, math.sqrt(sw2)))
        x.append(u + rng.gauss(0, math.sqrt(sv2)))
        if second:
            x2.append(u + rng.gauss(0, math.sqrt(sv2)))
    return x, x2, y


def _mean(v):
    return sum(v) / len(v)


def cov(p, q):
    mp, mq = _mean(p), _mean(q)
    return sum((s - mp) * (t - mq) for s, t in zip(p, q)) / (len(p) - 1)


def ols(x, y):
    return cov(x, y) / cov(x, x)


def corrected(x, y, sv2_assumed):
    return cov(x, y) / (cov(x, x) - sv2_assumed)


def iv(x, x2, y):
    """Second, independently-noised measurement of the same input as instrument."""
    return cov(x2, y) / cov(x2, x)


def r2(x, y, b):
    """Fit R^2 of the through-mean line y = b x."""
    my, mx = _mean(y), _mean(x)
    res = sum(((t - my) - b * (s - mx)) ** 2 for s, t in zip(x, y))
    tot = sum((t - my) ** 2 for t in y)
    return 1 - res / tot


def resid_corr(x, y, b):
    mx, my = _mean(x), _mean(y)
    e = [(t - my) - b * (s - mx) for s, t in zip(x, y)]
    return cov(x, e) / math.sqrt(cov(x, x) * cov(e, e))
