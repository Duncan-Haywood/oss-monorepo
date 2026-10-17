"""Shapley payments for a saturating (submodular) contribution game, exactly and by sampling.

Players i=0..n-1 have weights w_i>0; coalition value v(S)=1-exp(-sum_{i in S} w_i).
The marginal of i after predecessor set P is exp(-W(P))*(1-exp(-w_i)), bounded in [0,1].
"""
import math
import random
from itertools import combinations

__all__ = ["value", "marginal", "exact_shapley", "perm_second_moment", "perm_var",
           "strat_var", "sample_perm", "sample_perm_antithetic", "sample_strat",
           "hoeffding_samples", "rmse"]


def value(w, S):
    return 1.0 - math.exp(-sum(w[i] for i in S))


def marginal(w, i, P):
    return math.exp(-sum(w[j] for j in P)) * (1.0 - math.exp(-w[i]))


def _subsets_without(n, i):
    others = [j for j in range(n) if j != i]
    for k in range(n):
        for P in combinations(others, k):
            yield k, P


def exact_shapley(w):
    n = len(w)
    out = []
    for i in range(n):
        s = 0.0
        for k, P in _subsets_without(n, i):
            s += marginal(w, i, P) / (n * math.comb(n - 1, k))
        out.append(s)
    return out


def perm_second_moment(w, i):
    """E[m^2] for one random permutation: marginal of i after a uniform-size uniform-subset predecessor set."""
    n = len(w)
    return sum(marginal(w, i, P) ** 2 / (n * math.comb(n - 1, k)) for k, P in _subsets_without(n, i))


def perm_var(w, i, phi=None):
    phi = exact_shapley(w)[i] if phi is None else phi
    return perm_second_moment(w, i) - phi ** 2


def strat_var(w, i, m):
    """Variance of the size-stratified estimator using m total draws (m//n per size stratum)."""
    n = len(w)
    per = m // n
    tot = 0.0
    for k in range(n):
        vals = [marginal(w, i, P) for kk, P in _subsets_without(n, i) if kk == k]
        mu = sum(vals) / len(vals)
        var = sum((x - mu) ** 2 for x in vals) / len(vals)
        tot += var / per
    return tot / n ** 2


def sample_perm(w, m, rng):
    """Permutation sampling: m random permutations; every permutation telescopes to v(N)."""
    n = len(w)
    est = [0.0] * n
    idx = list(range(n))
    for _ in range(m):
        rng.shuffle(idx)
        acc = 0.0
        for i in idx:
            est[i] += math.exp(-acc) * (1 - math.exp(-w[i]))
            acc += w[i]
    return [e / m for e in est]


def sample_perm_antithetic(w, m, rng):
    """m permutations = m/2 random ones plus their reverses."""
    n = len(w)
    est = [0.0] * n
    idx = list(range(n))
    for _ in range(m // 2):
        rng.shuffle(idx)
        for order in (idx, idx[::-1]):
            acc = 0.0
            for i in order:
                est[i] += math.exp(-acc) * (1 - math.exp(-w[i]))
                acc += w[i]
    return [e / (2 * (m // 2)) for e in est]


def sample_strat(w, m, rng):
    """Per player, m//n uniformly drawn predecessor sets of each size k (m marginal evaluations per player)."""
    n = len(w)
    per = m // n
    est = []
    for i in range(n):
        others = [j for j in range(n) if j != i]
        tot = 0.0
        for k in range(n):
            s = 0.0
            for _ in range(per):
                s += marginal(w, i, rng.sample(others, k))
            tot += s / per
        est.append(tot / n)
    return est


def hoeffding_samples(n, eps, delta):
    """Permutations so that all n estimates are within eps of exact w.p. >= 1-delta (marginals in [0,1])."""
    return math.ceil(math.log(2 * n / delta) / (2 * eps ** 2))


def rmse(est, phi):
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(est, phi)) / len(phi))
