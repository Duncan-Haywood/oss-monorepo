"""Routed modules when tasks conflict (companion to forgetting-law, which left task-aware routing open).
Setting: realizable-up-to-offset regression in R^d. Task j has a Haar-random rank-r row space P_j and optimum
w* + delta_j with delta_j = mu_{c(j)} + eps_j: K clusters with centres mu_c ~ N(0, tau_b^2/d I) (between-cluster conflict)
and idiosyncratic offsets eps_j ~ N(0, tau_w^2/d I). Training a module to convergence on task j: e <- (I-P)e + P delta.
A router sends a task of cluster c to module g with probability R[c][g]; u[c] is the cluster prior.

Exact stationary argument. A module sees a stream delta with mean m and total variance s2 = tr Cov(delta). Writing
e = m + f, f' = (I-P)f + P(delta-m), so E|f'|^2 = rho E|f|^2 + (r/d) s2  =>  stationary E|f|^2 = s2 (rotation invariance
of P makes this exact for any fixed vector).  A task learned long ago has loss (r/d)(E|m-delta_j|^2 + s2).
With pi_g(c) = P(cluster c | module g) and iid centres, E|mu_c - m_g|^2 = tau_b^2 (1 - 2 pi_g(c) + sum_k pi_g(k)^2) and
s2_g = tau_w^2 + tau_b^2 (1 - sum_k pi_g(k)^2), so a cluster-c task on module g has old-task loss
    (r/d) [2 tau_w^2 + 2 tau_b^2 (1 - pi_g(c))]
and averaging over the router:   floor = (2r/d) [ tau_w^2 + tau_b^2 (1 - Purity) ],
    Purity = sum_g P(g) sum_c P(c|g)^2   (one minus the router's expected Gini impurity)."""
import math
import random

from forgetting_law import haar_projector
from forgetting_law.model import _proj

__all__ = ["module_marginals", "purity", "impurity", "floor", "shared_floor", "perfect_floor", "noisy_router",
           "block_router", "random_router", "removed_fraction", "modules_for_target", "purity_from_counts",
           "simulate_floor", "conflict_ceiling"]


def module_marginals(u, R):
    """Returns (P(g), P(c|g)) for prior u over K clusters and routing matrix R[c][g]."""
    K, M = len(u), len(R[0])
    pg = [sum(u[c] * R[c][g] for c in range(K)) for g in range(M)]
    post = [[(u[c] * R[c][g] / pg[g]) if pg[g] > 0 else 0.0 for c in range(K)] for g in range(M)]
    return pg, post


def purity(u, R):
    pg, post = module_marginals(u, R)
    return sum(p * sum(x * x for x in row) for p, row in zip(pg, post))


def impurity(u, R):
    return 1.0 - purity(u, R)


def floor(d, r, tw2, tb2, u, R):
    """Expected loss on a long-ago-learned task, averaged over clusters and routers."""
    return 2 * r / d * (tw2 + tb2 * impurity(u, R))


def shared_floor(d, r, tw2, tb2, u):
    """One module: purity = sum u^2."""
    return 2 * r / d * (tw2 + tb2 * (1 - sum(x * x for x in u)))


def perfect_floor(d, r, tw2, tb2, u):
    return 2 * r / d * tw2


def conflict_ceiling(d, r, tw2, tb2, K):
    """Uniform clusters, one shared module: 2 r tau^2 / d with tau^2 = tw2 + tb2 (1 - 1/K)."""
    return 2 * r / d * (tw2 + tb2 * (1 - 1 / K))


def noisy_router(K, q):
    """K clusters -> K modules; a task lands on its own module w.p. 1-q, else on a uniform other module."""
    return [[(1 - q) if g == c else q / (K - 1) for g in range(K)] for c in range(K)]


def block_router(K, m):
    """Perfect router onto m modules that partition the K clusters into near-equal groups."""
    return [[1.0 if g == c % m else 0.0 for g in range(m)] for c in range(K)]


def random_router(K, m):
    return [[1.0 / m] * m for _ in range(K)]


def removed_fraction(u, R):
    """Share of the between-cluster floor removed relative to a single shared module."""
    base = 1 - sum(x * x for x in u)
    return (base - impurity(u, R)) / base


def modules_for_target(K, frac):
    """Uniform clusters, perfect block router onto m modules: impurity = 1 - m/K, so removed share = (m-1)/(K-1).
    Smallest m removing at least `frac` of the between-cluster floor."""
    return min(K, 1 + math.ceil(frac * (K - 1) - 1e-12))


def purity_from_counts(counts):
    """Unbiased estimate of sum_c pi_c^2 from cluster labels of n audited tasks routed to one module:
    sum_c n_c (n_c - 1) / (n (n - 1))  (probability that two distinct audited tasks share a cluster)."""
    n = sum(counts)
    return sum(c * (c - 1) for c in counts) / (n * (n - 1))


def _gauss(rng):
    return rng.gauss(0.0, 1.0)


def simulate_floor(d, r, tw2, tb2, u, R, runs, rng, burn=40, lag=40):
    """Monte Carlo of the long-ago-task loss. Each run draws fresh cluster centres, picks a module g ~ P(g), runs its
    stream (clusters ~ P(c|g)) for `burn` tasks, learns a tracked task, then `lag` more, and returns the mean of
    |P_track (e - delta_track)|^2. Prediction: floor()."""
    pg, post = module_marginals(u, R)
    K = len(u)
    sb, sw = math.sqrt(tb2 / d), math.sqrt(tw2 / d)
    rgs = range(len(pg))
    tot = 0.0
    for _ in range(runs):
        mus = [[sb * _gauss(rng) for _ in range(d)] for _ in range(K)]
        g = rng.choices(rgs, weights=pg)[0]

        def draw():
            c = rng.choices(range(K), weights=post[g])[0]
            return [m + sw * _gauss(rng) for m in mus[c]]

        e = [0.0] * d
        for _ in range(burn):
            e = _step(haar_projector(d, r, rng), e, draw())
        Ut, dt = haar_projector(d, r, rng), draw()
        e = _step(Ut, e, dt)
        for _ in range(lag):
            e = _step(haar_projector(d, r, rng), e, draw())
        tot += sum(x * x for x in _proj(Ut, [a - b for a, b in zip(e, dt)]))
    return tot / runs


def _step(U, e, delta):
    pe, pd = _proj(U, e), _proj(U, delta)
    return [a - b + c for a, b, c in zip(e, pe, pd)]
