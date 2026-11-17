"""Exact (Monte-Carlo-free) operating characteristics for constant p.

With a constant claimed rate p, every rule in `model.py` depends on the outcome
sequence only through (t, s_t), the round and the number of faults so far, and
each rule's statistic is nondecreasing in s_t. So each rule is a boundary
c(t): it slashes at the first t with s_t >= c(t). Propagating the Binomial
mass of s_t under a true rate r, and removing what crosses the boundary, gives
the exact probability of ever slashing by T and the exact distribution of the
slashing time. The quality audit of 2026-11-07 used such a dynamic programme
outside the repository to check the Monte Carlo numbers; this is it, in the
repository, so tests can check validity exactly instead of with 800 noisy
trials (portfolio/quality/audits/2026-11-07-sequential-slashing.json).
"""
import math
from statistics import NormalDist

from .model import lr_step, mixture_grid, _check_rate

__all__ = ["boundary", "stop_distribution", "exact_slash_prob", "exact_mean_delay"]


def _first_s(ok, t):
    """Smallest s in 0..t with ok(s) true (ok monotone in s), else t+1."""
    lo, hi = 0, t + 1
    while lo < hi:
        mid = (lo + hi) // 2
        if ok(mid): hi = mid
        else: lo = mid + 1
    return lo


def boundary(method, p, alpha, T, q=None, K=64, t0=30, spacing="uniform"):
    """c[t] for t = 1..T (index 0 unused): slash at round t iff s_t >= c[t]."""
    _check_rate(p, "p")
    thr = math.log(1 / alpha)
    c = [0] * (T + 1)
    if method == "lr":
        _check_rate(q, "q")
        a, b = math.log(lr_step(1, p, q)), math.log(lr_step(0, p, q))
        for t in range(1, T + 1):
            c[t] = _first_s(lambda s: s * a + (t - s) * b >= thr - 1e-12, t)
    elif method == "mixture":
        ups = [(math.log(1 + l * (1 - p)), math.log(1 - l * p)) for l in mixture_grid(p, K, spacing)]
        for t in range(1, T + 1):
            def ok(s):
                ws = [s * u + (t - s) * d for u, d in ups]
                m = max(ws)
                return m + math.log(sum(math.exp(w - m) for w in ws) / K) >= thr - 1e-12
            c[t] = _first_s(ok, t)
    elif method == "z":
        z, sd = NormalDist().inv_cdf(1 - alpha), math.sqrt(p * (1 - p))
        for t in range(1, T + 1):
            c[t] = t + 1 if t < t0 else _first_s(lambda s: (s - t * p) / (sd * math.sqrt(t)) >= z, t)
    else:
        raise ValueError(f"unknown method {method!r}")
    return c


def stop_distribution(c, r):
    """P(first crossing of boundary c happens at round t), t = 1..T, under true rate r."""
    mass = [1.0]                      # mass[s] = P(s_t = s, not yet stopped)
    out = [0.0] * len(c)
    for t in range(1, len(c)):
        new = [0.0] * (len(mass) + 1)
        for s, m in enumerate(mass):
            if m:
                new[s] += m * (1 - r)
                new[s + 1] += m * r
        ct = c[t]
        out[t] = sum(new[ct:])
        mass = new[:ct]
        while mass and mass[-1] < 1e-300: mass.pop()
    return out


def exact_slash_prob(method, p, alpha, T, r=None, **kw):
    """Exact P(slashed within T rounds) when outcomes are Bernoulli(r) (r = p: honest)."""
    return sum(stop_distribution(boundary(method, p, alpha, T, **kw), p if r is None else r))


def exact_mean_delay(method, p, r, alpha, T, **kw):
    """(E[tau | tau <= T], P(tau <= T)) for a verifier whose true rate is r."""
    d = stop_distribution(boundary(method, p, alpha, T, **kw), r)
    P = sum(d)
    return sum(t * x for t, x in enumerate(d)) / P, P
