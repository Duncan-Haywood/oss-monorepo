"""Noisy secretary problem: does a margin rule beat the best cutoff rule? Stdlib only.

Setting as in ../free-secretarynoise: true quality q_i ~ N(0,1) iid, observed x_i = q_i + sigma * e_i.
Cutoff rule r: skip the first r-1 candidates, then take the first whose observed score beats every earlier observed
score. Margin rule (r, d): the same, but the candidate must beat the earlier maximum by at least d (in units of the
observed-score sd, sqrt(1 + sigma^2)); if none qualifies, take the last. d = 0 is the cutoff rule.
"""
import random
from math import sqrt


def pick_margin(x, r, d_abs):
    """0-based index chosen by the margin rule (r 1-based, d_abs in raw score units)."""
    n = len(x)
    if r <= 1:
        return 0
    bar = max(x[: r - 1])
    for i in range(r - 1, n):
        if x[i] > bar + d_abs:
            return i
    return n - 1


def draw(n, sigma, rng):
    """(index of the true best, observed scores) for one trial."""
    q = [rng.gauss(0, 1) for _ in range(n)]
    best = max(range(n), key=q.__getitem__)
    return best, [v + sigma * rng.gauss(0, 1) for v in q]


def make_trials(n, sigma, trials, seed):
    rng = random.Random(seed)
    return [draw(n, sigma, rng) for _ in range(trials)]


def p_best(trials, r, d_abs):
    """Success probability of rule (r, d_abs) on a fixed list of trials."""
    return sum(pick_margin(x, r, d_abs) == b for b, x in trials) / len(trials)


def search(trials, n, sigma, rs, ds):
    """Grid search on training trials. Returns (best cutoff r, its P), (best margin (r, d), its P)."""
    sd = sqrt(1.0 + sigma * sigma)
    best_c = max(((r, p_best(trials, r, 0.0)) for r in rs), key=lambda t: t[1])
    best_m = max((((r, d), p_best(trials, r, d * sd)) for r in rs for d in ds), key=lambda t: t[1])
    return best_c, best_m


def paired_diff(trials, rule_a, rule_b, sd):
    """Mean and standard error of 1[A hits] - 1[B hits] over the same trials. A, B are (r, d) pairs."""
    diffs = [(pick_margin(x, rule_a[0], rule_a[1] * sd) == b) - (pick_margin(x, rule_b[0], rule_b[1] * sd) == b)
             for b, x in trials]
    m = sum(diffs) / len(diffs)
    var = sum((v - m) ** 2 for v in diffs) / (len(diffs) - 1)
    return m, sqrt(var / len(diffs))
