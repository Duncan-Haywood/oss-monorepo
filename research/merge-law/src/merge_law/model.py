"""Merging m independently fine-tuned modules on random rank-r tasks in R^d (realizable: a common w* solves all).
Module j is trained to convergence from the shared start with error e0: e_j = (I-P_j)e0, P_j an isotropic random rank-r
projector.  The merge with scale a is  e = e0 - a * sum_j P_j e0  (a = 1/m is plain averaging, a = 1 is task arithmetic).
Only E[P]=p I, p=r/d, and independence are used, so every formula below holds for any isotropic task law.
  E|e|^2      = 1 - 2 a m p + a^2 (m p + m(m-1) p^2)                      (|e0| = 1)
  optimal a*  = 1/(1+(m-1)p),   E|e|^2 at a* = (1-p)/(1+(m-1)p)
  seen loss   = (1-a)^2 p - 2a(1-a)(m-1)p^2 + a^2 (m-1)(p^2 + (m-2)p^3)
  fresh loss  = p E|e|^2
Repeating merge rounds with m parallel workers contracts E|e|^2 by f_m = (1-p)/(1+(m-1)p) per round, versus (1-p)^m for m
sequential exact-convergence steps."""
import math
import random

__all__ = ["norm2", "best_scale", "best_norm2", "seen_loss", "fresh_loss", "seq_norm2", "rounds", "speedup",
           "efficiency", "capacity", "critical_m", "haar_projector", "simulate_merge", "simulate_rounds"]


def norm2(d, r, m, a):
    p = r / d
    return 1 - 2 * a * m * p + a * a * (m * p + m * (m - 1) * p * p)


def best_scale(d, r, m):
    return 1 / (1 + (m - 1) * r / d)


def best_norm2(d, r, m):
    p = r / d
    return (1 - p) / (1 + (m - 1) * p)


def seen_loss(d, r, m, a):
    """E loss on one of the m merged tasks."""
    p = r / d
    return (1 - a) ** 2 * p - 2 * a * (1 - a) * (m - 1) * p * p + a * a * (m - 1) * (p * p + (m - 2) * p ** 3)


def fresh_loss(d, r, m, a):
    return r / d * norm2(d, r, m, a)


def seq_norm2(d, r, m):
    return (1 - r / d) ** m


def rounds(d, r, m, eps):
    """Real-valued merge rounds (scale a*) to bring E|e|^2 to eps."""
    return math.log(eps) / math.log(best_norm2(d, r, m))


def speedup(d, r, m):
    """Rounds-of-sequential-steps saved: sequential steps / parallel rounds, at any eps (ratio of log-contractions)."""
    p = r / d
    return math.log(best_norm2(d, r, m)) / math.log(1 - p)


def efficiency(d, r, m):
    """Solves-per-unit-progress relative to sequential: speedup / m (1 = perfect scaling)."""
    return speedup(d, r, m) / m


def capacity(d, r):
    """Merge capacity 1/p = d/r: beyond m ~ d/r the optimal-scale error decays only like (1-p)/(mp), i.e. 1/m."""
    return d / r


def critical_m(d, r, eff=0.5):
    """Largest m whose parallel efficiency is at least eff."""
    m = 1
    while efficiency(d, r, m + 1) >= eff:
        m += 1
    return m


def _gauss(rng):
    return rng.gauss(0, 1)


def haar_projector(d, r, rng):
    U = []
    while len(U) < r:
        v = [_gauss(rng) for _ in range(d)]
        for u in U:
            p = sum(a * b for a, b in zip(u, v))
            v = [a - p * b for a, b in zip(v, u)]
        n = math.sqrt(sum(a * a for a in v))
        if n > 1e-9:
            U.append([a / n for a in v])
    return U


def _proj(U, e):
    out = [0.0] * len(e)
    for u in U:
        p = sum(a * b for a, b in zip(u, e))
        for i, a in enumerate(u):
            out[i] += p * a
    return out


def _unit(d, rng):
    e = [_gauss(rng) for _ in range(d)]
    n = math.sqrt(sum(x * x for x in e))
    return [x / n for x in e]


def simulate_merge(d, r, m, a, runs, rng):
    """Mean (|e|^2, seen-task loss averaged over the m tasks, fresh-task loss) of the merged model from |e0|=1."""
    n2 = sl = fl = 0.0
    for _ in range(runs):
        e0 = _unit(d, rng)
        Us = [haar_projector(d, r, rng) for _ in range(m)]
        e = list(e0)
        for U in Us:
            pe = _proj(U, e0)
            e = [x - a * y for x, y in zip(e, pe)]
        n2 += sum(x * x for x in e)
        sl += sum(sum(x * x for x in _proj(U, e)) for U in Us) / m
        fl += sum(x * x for x in _proj(haar_projector(d, r, rng), e))
    return n2 / runs, sl / runs, fl / runs


def simulate_rounds(d, r, m, nrounds, runs, rng):
    """Mean |e|^2 after each of nrounds merge rounds at scale a* (fresh random tasks per round), from |e|=1."""
    a = best_scale(d, r, m)
    acc = [0.0] * (nrounds + 1)
    for _ in range(runs):
        e = _unit(d, rng)
        acc[0] += 1.0
        for k in range(1, nrounds + 1):
            new = list(e)
            for _ in range(m):
                pe = _proj(haar_projector(d, r, rng), e)
                new = [x - a * y for x, y in zip(new, pe)]
            e = new
            acc[k] += sum(x * x for x in e)
    return [x / runs for x in acc]
