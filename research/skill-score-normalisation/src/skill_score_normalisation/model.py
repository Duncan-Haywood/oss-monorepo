"""Skill scores with an in-sample baseline.

A verifier reports r_i on tasks of type i (n_i i.i.d. binary tasks with true
probability p_i, tasks independent). The pooled realised base rate is
ybar = sum_i K_i / n, K_i ~ Bin(n_i, p_i). The Brier skill score pays
    BSS = 1 - Brier / (ybar (1 - ybar)),
with the convention BSS = 0 when ybar in {0, 1} (baseline undefined).
For constant reports per type this equals
    1 - [ sum_i K_i (1-r_i)^2 + (n_i-K_i) r_i^2 ] / (n ybar (1-ybar)),
which is quadratic in each r_i, so the expected-payoff maximiser is
    r_i* = a_i / (a_i + b_i),  a_i = E[K_i w], b_i = E[(n_i-K_i) w],  w = 1/(n ybar(1-ybar)) on 0<ybar<1.
"""
from math import lgamma, log, exp
import itertools, random


def _pmf(n, p):
    if p in (0.0, 1.0):
        return [float(k == (n if p else 0)) for k in range(n + 1)]
    lp, lq = log(p), log(1 - p)
    return [exp(lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + k * lp + (n - k) * lq) for k in range(n + 1)]


def optimal_reports(ns, ps):
    """Exact maximisers of expected BSS (in-sample baseline). Returns list of r_i*."""
    n = sum(ns)
    pm = [_pmf(ni, pi) for ni, pi in zip(ns, ps)]
    a = [0.0] * len(ns)
    b = [0.0] * len(ns)
    for ks in itertools.product(*[range(ni + 1) for ni in ns]):
        K = sum(ks)
        if K == 0 or K == n:
            continue
        pr = 1.0
        for i, k in enumerate(ks):
            pr *= pm[i][k]
        w = pr / (n * (K / n) * (1 - K / n))
        for i, k in enumerate(ks):
            a[i] += k * w
            b[i] += (ns[i] - k) * w
    return [ai / (ai + bi) for ai, bi in zip(a, b)]


def single_type_report(n, p):
    """Closed form for one task type: r* = A/(A+B), A=E[1/(1-ybar)], B=E[1/ybar] on the interior."""
    pm = _pmf(n, p)
    A = sum(pm[k] * n / (n - k) for k in range(1, n))
    B = sum(pm[k] * n / k for k in range(1, n))
    return A / (A + B)


def expected_bss(ns, ps, rs):
    n = sum(ns)
    pm = [_pmf(ni, pi) for ni, pi in zip(ns, ps)]
    tot = 0.0
    for ks in itertools.product(*[range(ni + 1) for ni in ns]):
        K = sum(ks)
        if K == 0 or K == n:
            continue
        pr = 1.0
        for i, k in enumerate(ks):
            pr *= pm[i][k]
        num = sum(k * (1 - r) ** 2 + (ni - k) * r**2 for k, ni, r in zip(ks, ns, rs))
        tot += pr * (1 - num / (n * (K / n) * (1 - K / n)))
    return tot


def expected_loo(ns, ps, rs):
    """Leave-one-out baseline: task j is paid (ybar_{-j}-y_j)^2 - (r-y_j)^2 (mean over tasks).
    Baseline is the mean of the other tasks' outcomes, independent of y_j when tasks are independent,
    so the payment is a proper score of r_j against p_j (up to a constant). Exact expectation."""
    n = sum(ns)
    tot = 0.0
    for ni, pi, r in zip(ns, ps, rs):
        for y in (0, 1):
            py = pi if y else 1 - pi
            # E over the other n-1 outcomes of (ybar_{-j}-y)^2 : mean m, var v
            m = (sum(nk * pk for nk, pk in zip(ns, ps)) - pi) / (n - 1)
            v = (sum(nk * pk * (1 - pk) for nk, pk in zip(ns, ps)) - pi * (1 - pi)) / (n - 1) ** 2
            tot += ni * py * (((m - y) ** 2 + v) - (r - y) ** 2)
    return tot / n


def misreport_cost(p, r):
    """True expected Brier loss of reporting r instead of p (per task): (r-p)^2."""
    return (r - p) ** 2


def simulate_report(ns, ps, rs, trials=200000, seed=0):
    rng = random.Random(seed)
    n = sum(ns)
    tot = 0.0
    for _ in range(trials):
        num = 0.0
        K = 0
        for ni, pi, r in zip(ns, ps, rs):
            k = sum(rng.random() < pi for _ in range(ni))
            K += k
            num += k * (1 - r) ** 2 + (ni - k) * r**2
        if 0 < K < n:
            tot += 1 - num / (n * (K / n) * (1 - K / n))
    return tot / trials
