"""Scoring-rule payments as effort contracts (stdlib only).

A worker privately picks effort e >= 0 (cost c e^2/2) that sharpens a symmetric binary signal of accuracy
q(e) = 1/2 + (kappa/2)(1 - exp(-e)). She reports her posterior and is paid alpha * (S(report, outcome) - S(1/2, outcome)),
i.e. a proper score relative to the uninformed prior report, so payment >= 0 in expectation and reporting the prior earns 0.
Truthful reporting is optimal (properness), so the only strategic choice is effort. The principal's value of a report
is w * (q - 1/2)^2 (the Brier value of information for a quadratic-loss decision).
"""
import math

LN2 = math.log(2.0)


def accuracy(e, kappa=0.9):
    return 0.5 + 0.5 * kappa * (1.0 - math.exp(-e))


def info_brier(q):
    """Expected Brier score gain over the prior report: (q - 1/2)^2."""
    return (q - 0.5) ** 2


def info_log(q):
    """Expected log score gain over the prior report (nats) = mutual information ln2 - H(q)."""
    if q <= 0.0 or q >= 1.0:
        return LN2
    return LN2 + q * math.log(q) + (1 - q) * math.log(1 - q)


SCORES = {"brier": info_brier, "log": info_log}


def best_effort(alpha, c, score="brier", kappa=0.9, emax=8.0, n=8000):
    """Agent's utility-maximising effort on a grid (global search, so jumps from 0 are captured)."""
    f = SCORES[score]
    best_e, best_u = 0.0, 0.0
    for i in range(1, n + 1):
        e = emax * i / n
        u = alpha * f(accuracy(e, kappa)) - 0.5 * c * e * e
        if u > best_u + 1e-15:
            best_e, best_u = e, u
    return best_e, best_u


def value(e, w=1.0, kappa=0.9):
    return w * info_brier(accuracy(e, kappa))


def first_best(c, w=1.0, kappa=0.9, emax=8.0, n=8000):
    best = (0.0, 0.0)
    for i in range(1, n + 1):
        e = emax * i / n
        s = value(e, w, kappa) - 0.5 * c * e * e
        if s > best[1]:
            best = (e, s)
    return best


def principal_optimum(c, w=1.0, score="brier", kappa=0.9, alphas=None):
    """Second best under limited liability: choose the scale alpha maximising value minus expected payment."""
    f = SCORES[score]
    alphas = alphas or [w * i / 400 for i in range(1, 1601)]
    best = (0.0, 0.0, 0.0)  # (surplus, alpha, effort)
    for a in alphas:
        e, _ = best_effort(a, c, score, kappa, n=2000)
        s = value(e, w, kappa) - a * f(accuracy(e, kappa))
        if s > best[0]:
            best = (s, a, e)
    return best


def shirk_threshold(c, score="brier", kappa=0.9, lo=0.0, hi=50.0):
    """Smallest scale alpha for which the worker exerts positive effort (bisection on the global best response)."""
    for _ in range(50):
        mid = 0.5 * (lo + hi)
        if best_effort(mid, c, score, kappa, n=2000)[0] > 0:
            hi = mid
        else:
            lo = mid
    return hi


def local_threshold(c, score="brier", kappa=0.9):
    """Small-effort prediction: info ~ k (kappa e / 2)^2 with k = 1 (Brier), 2 (log), so alpha0 = 2c / (k kappa^2)."""
    k = {"brier": 1.0, "log": 2.0}[score]
    return 2.0 * c / (k * kappa * kappa)


def induced_payment(e, c, score="brier", kappa=0.9, h=1e-5):
    """Scale alpha(e) = c e / info'(e) that makes effort e a first-order optimum, and the resulting expected payment and rent."""
    f = SCORES[score]
    d = (f(accuracy(e + h, kappa)) - f(accuracy(e - h, kappa))) / (2 * h)
    a = c * e / d
    pay = a * f(accuracy(e, kappa))
    return a, pay, pay - 0.5 * c * e * e
