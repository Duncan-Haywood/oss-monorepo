"""Secretary problem when only a noisy score of each candidate is seen.

Candidate i has true quality q_i ~ N(0,1) (iid) and the interviewer sees x_i = q_i + sigma * e_i, e_i ~ N(0,1).
Cutoff rule with parameter r: skip candidates 1..r-1, then take the first later candidate whose *observed*
score beats every observed score so far; if none does, take the last one. Success = the pick has the largest
true quality. Stdlib only.
"""
import random
from math import fsum


def exact_noiseless(n, r):
    """P(pick the best) for the classical cutoff rule with ranks only (sigma = 0): (r-1)/n * sum_{j=r}^{n} 1/(j-1)."""
    if r <= 1:
        return 1.0 / n
    return (r - 1) / n * fsum(1.0 / (j - 1) for j in range(r, n + 1))


def pick(x, r):
    """0-based index chosen by the cutoff rule with parameter r (1-based) on observed scores x."""
    n = len(x)
    if r <= 1:
        return 0
    bar = max(x[: r - 1])
    for i in range(r - 1, n):
        if x[i] > bar:
            return i
    return n - 1


def trial(n, sigma, rng):
    q = [rng.gauss(0, 1) for _ in range(n)]
    x = [v + sigma * rng.gauss(0, 1) for v in q]
    return q, x


def sweep(n, sigma, cutoffs, trials, seed):
    """For each cutoff: (P(best), mean true quality percentile of the pick). Same draws for every cutoff."""
    rng = random.Random(seed)
    hit = {r: 0 for r in cutoffs}
    pct = {r: 0.0 for r in cutoffs}
    for _ in range(trials):
        q, x = trial(n, sigma, rng)
        order = sorted(range(n), key=lambda i: q[i])
        rank = [0] * n  # 0 = worst, n-1 = best
        for k, i in enumerate(order):
            rank[i] = k
        best = order[-1]
        for r in cutoffs:
            c = pick(x, r)
            hit[r] += c == best
            pct[r] += rank[c] / (n - 1)
    return {r: (hit[r] / trials, pct[r] / trials) for r in cutoffs}
