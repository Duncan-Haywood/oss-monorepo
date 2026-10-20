"""Pairwise-gossip consensus over n scalar 'parameters' (a stylised NoLoCo-style averaging step).

Disagreement is Phi = sum_i (x_i - mean)^2. Pair updates are symmetric, so the mean of a group is conserved.
"""
import random


def phi(x):
    m = sum(x) / len(x)
    return sum((v - m) ** 2 for v in x)


def pair_step(x, i, j, tau=None):
    """Nodes i, j move toward each other by d/2, or by at most tau/2 each if tau is set (trust-region clip)."""
    d = x[j] - x[i]
    step = d / 2.0
    if tau is not None:
        step = max(-tau / 2.0, min(tau / 2.0, step))
    x[i] += step
    x[j] -= step


def matching_round(x, rng):
    """Average a uniformly random perfect matching (n even)."""
    idx = list(range(len(x)))
    rng.shuffle(idx)
    for k in range(0, len(idx), 2):
        pair_step(x, idx[k], idx[k + 1])


# ---- closed forms ----
def pair_contraction(n):
    """E[Phi'] / Phi for one uniformly random pair averaged: 1 - 1/(n-1)."""
    return 1.0 - 1.0 / (n - 1)


def matching_contraction(n):
    """E[Phi'] / Phi for a uniformly random perfect matching averaged: (n-2) / (2(n-1)) -> 1/2."""
    return (n - 2.0) / (2.0 * (n - 1.0))


def stationary_phi(n, s2):
    """Phi right after a matching round when each round first adds iid noise of variance s2 per node."""
    return (n - 1.0) * (n - 2.0) * s2 / n


def rounds_to_eps(n, eps):
    """Matching rounds so that the expected Phi has fallen below eps * Phi_0."""
    import math
    return math.ceil(math.log(eps) / math.log(matching_contraction(n)))


def stubborn_gap_decay(n):
    """Per-step factor of E[c - honest_mean] when node 0 holds c and everyone else gossips uniformly at random."""
    return 1.0 - 1.0 / (n * (n - 1.0))


def clipped_drift_rate(n, tau):
    """Upper bound on E[honest-mean shift] per step from one stubborn node when exchanges are clipped at tau."""
    return tau / (n * (n - 1.0))


# ---- simulation ----
def mean_contraction(n, kind, reps=4000, seed=0):
    """Monte-Carlo E[Phi'/Phi] starting from iid N(0,1) values (ratio of averages)."""
    rng = random.Random(seed)
    a = b = 0.0
    for _ in range(reps):
        x = [rng.gauss(0, 1) for _ in range(n)]
        a += phi(x)
        if kind == "pair":
            i, j = rng.sample(range(n), 2)
            pair_step(x, i, j)
        else:
            matching_round(x, rng)
        b += phi(x)
    return b / a


def steady_phi(n, s2, rounds=400, burn=100, seed=0):
    rng = random.Random(seed)
    x = [0.0] * n
    tot, cnt = 0.0, 0
    for t in range(rounds):
        x = [v + rng.gauss(0, s2 ** 0.5) for v in x]
        matching_round(x, rng)
        if t >= burn:
            tot += phi(x)
            cnt += 1
    return tot / cnt


def stubborn_run(n, c, steps, tau=None, reps=200, seed=0):
    """Mean over reps of the honest mean after `steps` uniform pair exchanges; node 0 is stuck at c.

    Honest values start iid N(0,1). Returns (mean of honest-mean, mean honest disagreement per node).
    """
    rng = random.Random(seed)
    m_tot = d_tot = 0.0
    for _ in range(reps):
        x = [c] + [rng.gauss(0, 1) for _ in range(n - 1)]
        for _ in range(steps):
            i, j = rng.sample(range(n), 2)
            if i == 0 or j == 0:
                k = j if i == 0 else i
                d = c - x[k]
                step = d / 2.0 if tau is None else max(-tau / 2.0, min(tau / 2.0, d / 2.0))
                x[k] += step  # node 0 does not move
            else:
                pair_step(x, i, j, tau)
        h = x[1:]
        m_tot += sum(h) / len(h)
        d_tot += phi(h) / len(h)
    return m_tot / reps, d_tot / reps
