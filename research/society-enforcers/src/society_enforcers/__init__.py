"""Queue-enforcing robots against line-cutting robots.

Extends society-lineup. A share rho of the crowd are robots that always cut, a share e are
enforcer robots that queue and object to cuts they see, and the rest are people who remember
the last M cut attempts they watched and cut next iff a strict majority succeeded.

A cut attempt is objected to by bystander people with probability p0 * (1 - z)**k (fades as the
cutting share z grows, as in society-lineup) and, independently, by enforcers: each of the L
people in view is an enforcer with probability e, and each enforcer in view stops the cut with
probability q, so enforcers stop it with probability pe = 1 - (1 - q*e)**L. Enforcers do not
fade as cutting spreads, which is the point of the project.
"""
import math
import random


def enforcer_stop(e, q, view):
    """P(at least one enforcer in view stops a cut)."""
    return 1.0 - (1.0 - q * e) ** view


def success_prob(z, p0, k=1.0, e=0.0, q=0.5, view=10):
    """P(a cut attempt succeeds) when a share z of everyone cuts and a share e are enforcers."""
    return (1.0 - p0 * (1.0 - z) ** k) * (1.0 - enforcer_stop(e, q, view))


def maj_prob(s, m):
    """P(strict majority of m Bernoulli(s) trials are successes); m odd."""
    need = m // 2 + 1
    return sum(math.comb(m, j) * s**j * (1 - s) ** (m - j) for j in range(need, m + 1))


def step(x, rho, m, p0, k=1.0, eps=0.02, e=0.0, q=0.5, view=10):
    z = rho + (1 - rho - e) * x
    s = success_prob(z, p0, k, e, q, view)
    s = s * (1 - eps) + (1 - s) * eps
    return maj_prob(s, m)


def human_cut_share(rho, m, p0, k=1.0, eps=0.02, e=0.0, q=0.5, view=10, x0=0.0, iters=4000):
    """Long-run share of people who cut, from x0 (0 = a working queue norm)."""
    x = x0
    for _ in range(iters):
        x = step(x, rho, m, p0, k, eps, e, q, view)
    return x


def critical_share(m, p0, k=1.0, eps=0.02, e=0.0, q=0.5, view=10, tol=1e-4):
    """Least cutter-robot share rho at which a norm-abiding crowd ends with most people cutting.

    Returns 0.0 if the norm is unstable with no cutters, nan if even rho = 1 - e does not tip it.
    """
    top = 1.0 - e - 1e-9
    f = lambda r: human_cut_share(r, m, p0, k, eps, e, q, view)
    if f(top) < 0.5:
        return float("nan")
    if f(0.0) >= 0.5:
        return 0.0
    lo, hi = 0.0, top
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if f(mid) >= 0.5:
            hi = mid
        else:
            lo = mid
    return hi


def min_enforcers(rho, m, p0, k=1.0, eps=0.02, q=0.5, view=10, tol=1e-4):
    """Least enforcer share e that keeps most people queueing against cutter share rho.

    0.0 if none is needed; nan if no e <= 1 - rho does it.
    """
    holds = lambda e: human_cut_share(rho, m, p0, k, eps, e, q, view) < 0.5
    if holds(0.0):
        return 0.0
    top = 1.0 - rho - 1e-9
    if not holds(top):
        return float("nan")
    lo, hi = 0.0, top
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if holds(mid):
            hi = mid
        else:
            lo = mid
    return hi


def simulate(n, rho, m, p0, k=1.0, eps=0.02, e=0.0, q=0.5, view=10, rounds=400, seed=0):
    """Agent simulation; returns the mean human cut share over the last 100 rounds."""
    rng = random.Random(seed)
    nr = round(rho * n)
    ne = round(e * n)
    nh = n - nr - ne
    mem = [[False] * m for _ in range(nh)]
    tail = []
    for r in range(rounds):
        cuts = [sum(h) >= m // 2 + 1 for h in mem]
        z = (nr + sum(cuts)) / n
        s = success_prob(z, p0, k, e, q, view)
        for i in range(nh):
            if z > 0:
                ok = rng.random() < s
                seen = ok if rng.random() >= eps else (not ok)
                mem[i].pop(0)
                mem[i].append(seen)
        if r >= rounds - 100:
            tail.append(sum(cuts) / nh)
    return sum(tail) / len(tail)
