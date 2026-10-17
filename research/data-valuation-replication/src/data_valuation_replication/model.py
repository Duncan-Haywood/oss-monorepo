"""Paying contributors of data/gradients when a contributor can submit copies of the same contribution.

Value of a set of submissions is the risk reduction of a Bayesian mean estimator, g(P) = 1/t0 - 1/(t0+P), where P is
the total (effective) precision. One replicator holds k copies of a contribution of precision `a`; n honest others each
hold precision `tau`. `rho` in [0,1] is the correlation between the copies: rho=0 means the copies count as independent
(a naive evaluator), rho=1 means a copy adds nothing. Effective precision of c copies is a*c/(1+(c-1)rho).
Shapley values are computed exactly by summing over coalition compositions (no sampling).
"""
import math, random
from math import comb

__all__ = ["g", "eff_precision", "value", "shapley_copy", "group_shapley", "group_loo", "share", "standalone_limit",
           "shapley_bruteforce", "shapley_integral", "break_even_cost", "best_k", "shapley_honest"]


def g(P, t0=1.0):
    """Risk reduction of a Bayes mean estimator with total data precision P and prior precision t0."""
    return 1 / t0 - 1 / (t0 + P)


def eff_precision(c, a, rho):
    """Effective precision of c copies of a precision-a contribution with pairwise correlation rho."""
    return 0.0 if c == 0 else a * c / (1 + (c - 1) * rho)


def value(c, j, a, tau, rho, t0=1.0):
    """Coalition value with c of the replicator's copies and j honest others."""
    return g(eff_precision(c, a, rho) + tau * j, t0)


def shapley_copy(k, n, a, tau, rho, t0=1.0):
    """Exact Shapley value of ONE of the replicator's k copies (all copies are symmetric)."""
    N = k + n
    tot = 0.0
    for c in range(k):          # other copies present
        for j in range(n + 1):  # honest others present
            s = c + j
            w = comb(k - 1, c) * comb(n, j) / (N * comb(N - 1, s))
            tot += w * (value(c + 1, j, a, tau, rho, t0) - value(c, j, a, tau, rho, t0))
    return tot


def group_shapley(k, n, a, tau, rho, t0=1.0):
    """Total Shapley payment to the replicator across all k copies."""
    return k * shapley_copy(k, n, a, tau, rho, t0)


def group_loo(k, n, a, tau, rho, t0=1.0):
    """Total leave-one-out payment to the replicator: each copy is paid v(all) - v(all minus that copy)."""
    return k * (value(k, n, a, tau, rho, t0) - value(k - 1, n, a, tau, rho, t0))


def share(k, n, a, tau, rho, t0=1.0):
    """Replicator's fraction of the grand-coalition Shapley pot (efficiency: pot = value(k, n))."""
    return group_shapley(k, n, a, tau, rho, t0) / value(k, n, a, tau, rho, t0)


def standalone_limit(a, t0=1.0):
    """k -> infinity limit of the group Shapley payment when rho=1: the stand-alone value g(a)."""
    return g(a, t0)


def shapley_bruteforce(weights, groups, rho, t0=1.0):
    """Reference implementation by full permutation enumeration for tiny games.

    groups[i] is the identity of player i's contribution; players sharing a group are copies (correlation rho).
    Value = g(sum over groups of eff_precision(count in coalition, weight, rho))."""
    import itertools
    n = len(weights)
    phi = [0.0] * n

    def val(S):
        cnt = {}
        for i in S: cnt[groups[i]] = cnt.get(groups[i], 0) + 1
        P = sum(eff_precision(c, weights[[i for i in range(n) if groups[i] == gid][0]], rho) for gid, c in cnt.items())
        return g(P, t0)
    f = math.factorial(n)
    for perm in itertools.permutations(range(n)):
        S = []
        prev = 0.0
        for i in perm:
            S.append(i); cur = val(S)
            phi[i] += (cur - prev) / f; prev = cur
    return phi


def shapley_integral(k, n, a, tau, rho, t0=1.0, steps=4000):
    """Shapley of one copy via the identity phi = int_0^1 E[marginal | each other player present w.p. t] dt (midpoint)."""
    tot = 0.0
    for m in range(steps):
        t = (m + 0.5) / steps
        e = 0.0
        for c in range(k):
            pc = comb(k - 1, c) * t ** c * (1 - t) ** (k - 1 - c)
            for j in range(n + 1):
                pj = comb(n, j) * t ** j * (1 - t) ** (n - j)
                e += pc * pj * (value(c + 1, j, a, tau, rho, t0) - value(c, j, a, tau, rho, t0))
        tot += e / steps
    return tot


def break_even_cost(k, n, a, tau, rho, t0=1.0):
    """Largest total cost of producing k-1 extra copies at which replicating still beats submitting once."""
    return group_shapley(k, n, a, tau, rho, t0) - group_shapley(1, n, a, tau, rho, t0)


def best_k(n, a, tau, rho, cost_per_copy, kmax=200, t0=1.0):
    """Payoff-maximising number of copies when each extra copy costs cost_per_copy."""
    best, bk = -1e18, 1
    for k in range(1, kmax + 1):
        u = group_shapley(k, n, a, tau, rho, t0) - cost_per_copy * (k - 1)
        if u > best: best, bk = u, k
    return bk


def shapley_honest(k, n, a, tau, rho, t0=1.0):
    """Exact Shapley value of one honest other when the replicator holds k copies."""
    N = k + n
    tot = 0.0
    for c in range(k + 1):
        for j in range(n):
            s = c + j
            w = comb(k, c) * comb(n - 1, j) / (N * comb(N - 1, s))
            tot += w * (value(c, j + 1, a, tau, rho, t0) - value(c, j, a, tau, rho, t0))
    return tot
