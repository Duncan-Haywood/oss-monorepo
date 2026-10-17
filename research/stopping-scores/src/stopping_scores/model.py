"""A verifier checks a binary claim one noisy check at a time and may stop whenever it likes, then reports its posterior and
is paid a proper score.  Each check is an independent signal of accuracy a > 1/2 about a state with prior 1/2 and costs c.

Posterior log-odds live on the lattice x = j*lam, lam = ln(a/(1-a)), and j is a simple random walk (up w.p. a in the true
state).  Truthful expected payoff at belief p is the score's entropy G(p) (convex, symmetric); the verifier maximises
E[G(p_tau)] - c E[tau].  For a symmetric threshold rule |j| = k:
    p_k = 1/(1+r^k),  r = (1-a)/a;   E[G(p_tau)] = G(p_k);   E[tau] = k (2 p_k - 1)/(2a - 1)   (gambler's ruin + Wald).
"""
import math, random

__all__ = ["G_brier", "G_log", "p_k", "expected_checks", "utility", "best_threshold", "dp_value", "dp_policy",
           "fixed_utility", "best_fixed", "participation_scale", "simulate"]


def G_brier(p, kappa=1.0):
    """truthful expected payoff of S = kappa (1 - (r - theta)^2): kappa (1 - p(1-p))."""
    return kappa * (1 - p * (1 - p))


def G_log(p, kappa=1.0):
    """truthful expected payoff of S = kappa ln r_theta: -kappa H(p) (nats)."""
    return 0.0 if p in (0.0, 1.0) else kappa * (p * math.log(p) + (1 - p) * math.log(1 - p))


def p_k(a, k):
    """posterior at the boundary |j| = k."""
    return 1 / (1 + ((1 - a) / a) ** k)


def expected_checks(a, k):
    """E[number of checks] until |j| = k, from j = 0: k (2 p_k - 1)/(2a - 1) (k = 0 gives 0)."""
    return k * (2 * p_k(a, k) - 1) / (2 * a - 1)


def utility(G, a, c, k):
    return G(p_k(a, k)) - c * expected_checks(a, k)


def best_threshold(G, a, c, kmax=400):
    """(k*, U(k*)) over symmetric thresholds k = 0..kmax."""
    best = max(range(kmax + 1), key=lambda k: utility(G, a, c, k))
    return best, utility(G, a, c, best)


def dp_value(G, a, c, K=60, iters=4000):
    """value function V(j) of the unrestricted stopping problem on the lattice |j| <= K (forced stop at K);
    V(j) = max(G(p_j), a' V(j+1) + (1-a') V(j-1) - c) with a' the predictive up-probability at posterior p_j.  Returns dict j -> V."""
    lam = math.log(a / (1 - a))
    p = {j: 1 / (1 + math.exp(-j * lam)) for j in range(-K, K + 1)}
    up = {j: p[j] * a + (1 - p[j]) * (1 - a) for j in range(-K, K + 1)}
    V = {j: G(p[j]) for j in range(-K, K + 1)}
    for _ in range(iters):
        new = dict(V)
        for j in range(-K + 1, K):
            new[j] = max(G(p[j]), up[j] * V[j + 1] + (1 - up[j]) * V[j - 1] - c)
        if max(abs(new[j] - V[j]) for j in V) < 1e-14:
            V = new
            break
        V = new
    return V


def dp_policy(G, a, c, K=60):
    """set of lattice points j at which continuing is strictly better than stopping."""
    lam = math.log(a / (1 - a))
    V = dp_value(G, a, c, K)
    cont = []
    for j in range(-K + 1, K):
        pj = 1 / (1 + math.exp(-j * lam))
        if V[j] > G(pj) + 1e-12:
            cont.append(j)
    return cont


def fixed_utility(G, a, c, n):
    """commit to n checks up front, then report the posterior: E[G(p_n)] - c n (exact binomial sum)."""
    lam = math.log(a / (1 - a))
    tot = 0.0
    for s in range(n + 1):                                    # s correct signals out of n, state yes or no
        x = (2 * s - n) * lam
        pj = 1 / (1 + math.exp(-x))
        pr_yes = 0.5 * math.comb(n, s) * a ** s * (1 - a) ** (n - s)
        pr_no = 0.5 * math.comb(n, s) * (1 - a) ** s * a ** (n - s)
        tot += (pr_yes + pr_no) * G(pj)
    return tot - c * n


def best_fixed(G, a, c, nmax=300):
    best = max(range(nmax + 1), key=lambda n: fixed_utility(G, a, c, n))
    return best, fixed_utility(G, a, c, best)


def participation_scale(G_unit, a, c):
    """smallest score scale kappa at which the verifier checks at least once: G_unit(a) - G_unit(1/2) >= c / kappa
    (one check at k = 1 costs exactly c since E[tau] = 1)."""
    return c / (G_unit(a) - G_unit(0.5))


def simulate(a, k, rng):
    """one run of the threshold-k rule from a fair-coin state; returns (stopped-correct, checks)."""
    yes = rng.random() < 0.5
    j = n = 0
    while abs(j) < k:
        good = rng.random() < a
        j += 1 if good == yes else -1
        n += 1
    return (j > 0) == yes, n
