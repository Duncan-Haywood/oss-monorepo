"""Queueing-norm erosion with committed line-cutting robots.

People (share 1-rho) each remember the outcomes of their last M observed cut attempts and
cut next time iff a strict majority succeeded. A cut attempt is objected to (and fails)
with probability p0 * (1 - z)**k, where z is the share of all cut attempts' population
that cuts: enforcement fades as cutting becomes common. Robots (share rho) always cut.
"""
import math
import random


def success_prob(z, p0, k=1.0):
    """P(a cut attempt succeeds) when a share z of everyone cuts."""
    return 1.0 - p0 * (1.0 - z) ** k


def maj_prob(s, m):
    """P(strict majority of m Bernoulli(s) trials are successes); m odd."""
    need = m // 2 + 1
    return sum(math.comb(m, j) * s**j * (1 - s) ** (m - j) for j in range(need, m + 1))


def step(x, rho, m, p0, k=1.0, eps=0.02):
    z = rho + (1 - rho) * x
    s = success_prob(z, p0, k)
    s = s * (1 - eps) + (1 - s) * eps  # observation error
    return maj_prob(s, m)


def fixed_point(x0, rho, m, p0, k=1.0, eps=0.02, iters=4000):
    x = x0
    for _ in range(iters):
        x = step(x, rho, m, p0, k, eps)
    return x


def human_cut_share(rho, m, p0, k=1.0, eps=0.02, x0=0.0):
    """Long-run share of people who cut, starting from x0 (0 = a working queue norm)."""
    return fixed_point(x0, rho, m, p0, k, eps)


def critical_share(m, p0, k=1.0, eps=0.02, tol=1e-4):
    """Least rho at which a norm-abiding crowd (x0=0) ends with most people cutting; nan if none."""
    if human_cut_share(1.0 - 1e-9, m, p0, k, eps) < 0.5:
        return float("nan")
    lo, hi = 0.0, 1.0
    if human_cut_share(lo, m, p0, k, eps) >= 0.5:
        return 0.0
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if human_cut_share(mid, m, p0, k, eps) >= 0.5:
            hi = mid
        else:
            lo = mid
    return hi


def simulate(n, rho, m, p0, k=1.0, eps=0.02, rounds=400, seed=0):
    """Agent simulation. Returns (final human cut share, objections per cut attempt, last-100-round mean cut share)."""
    rng = random.Random(seed)
    nr = round(rho * n)
    nh = n - nr
    mem = [[False] * m for _ in range(nh)]  # all remembered failures: norm intact
    cuts = [False] * nh
    obj = att = 0
    tail = []
    for r in range(rounds):
        cuts = [sum(h) >= m // 2 + 1 for h in mem]
        z = (nr + sum(cuts)) / n
        s = success_prob(z, p0, k)
        for i in range(nh):
            if cuts[i]:
                att += 1
                ok = rng.random() < s
                obj += not ok
            # each person watches one random cut attempt per round (if any cutters exist)
            if z > 0:
                ok = rng.random() < s
                seen = ok if rng.random() >= eps else (not ok)
                mem[i].pop(0)
                mem[i].append(seen)
        if r >= rounds - 100:
            tail.append(sum(cuts) / nh if nh else 0.0)
    return sum(cuts) / nh if nh else 0.0, obj / att if att else 0.0, sum(tail) / len(tail)
