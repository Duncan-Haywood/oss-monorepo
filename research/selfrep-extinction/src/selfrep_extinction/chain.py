"""Birth-death chain for the fleet of a wearing-out replicating printer shop (stylised).

State n = number of machines. Deaths occur at rate n/L (exponential life, mean L hours). Births occur at rate
b(n) = (1-f) * min(n/W, B/V) for n >= 1 and 0 for n = 0 (absorbing): each machine makes (1-f) copies per W hours
at most, and the whole shop at most (1-f) B/V copies per hour from the import stream B. This ignores the wait
for stock, the build-time spread, builds cut short by retirement and recycling, so it is an abstraction of the
discrete-event model in ``selfrep-wearout``, not a copy of it. The mean time to extinction from n machines is
solved exactly (tridiagonal linear system), so the chain has a known answer to test against.
"""
import math
import random


def birth_rate(n, work_h, vit_cost, budget, fail=0.0, life_h=None):
    """Birth rate; if ``life_h`` is given, scale by exp(-work_h/life_h), the chance a build outlives its machine."""
    if n <= 0:
        return 0.0
    keep = math.exp(-work_h / life_h) if life_h else 1.0
    return keep * (1 - fail) * min(n / work_h, budget / vit_cost)


def mean_extinction_times(work_h, vit_cost, budget, life_h, fail=0.0, nmax=200, interrupt=False):
    """Exact E[time to reach 0 from n] for n = 0..nmax, births suppressed at nmax (reflecting top).

    Solves (b_n + d_n) T_n - b_n T_{n+1} - d_n T_{n-1} = 1 with T_0 = 0 and T_nmax's birth term dropped.
    """
    lf = life_h if interrupt else None
    b = [birth_rate(n, work_h, vit_cost, budget, fail, lf) for n in range(nmax + 1)]
    b[nmax] = 0.0
    d = [n / life_h for n in range(nmax + 1)]
    # Thomas algorithm on unknowns T_1..T_nmax
    m = nmax
    lo = [-d[n] for n in range(1, m + 1)]
    di = [b[n] + d[n] for n in range(1, m + 1)]
    up = [-b[n] for n in range(1, m + 1)]
    rhs = [1.0] * m
    for i in range(1, m):
        w = lo[i] / di[i - 1]
        di[i] -= w * up[i - 1]
        rhs[i] -= w * rhs[i - 1]
    t = [0.0] * (m + 1)
    t[m] = rhs[m - 1] / di[m - 1]
    for i in range(m - 2, -1, -1):
        t[i + 1] = (rhs[i] - up[i] * t[i + 2]) / di[i]
    return t


def equilibrium(work_h, vit_cost, budget, life_h, fail=0.0):
    """Fleet size where the deterministic birth rate equals the death rate (import-limited branch)."""
    return (1 - fail) * budget * life_h / vit_cost


def gillespie_extinction(n0, work_h, vit_cost, budget, life_h, fail=0.0, seed=0, horizon=1e9, interrupt=False):
    """One sample path of the same chain; returns the extinction time, or ``horizon`` if not reached."""
    rng = random.Random(seed)
    n, t = n0, 0.0
    while n > 0 and t < horizon:
        b = birth_rate(n, work_h, vit_cost, budget, fail, life_h if interrupt else None)
        d = n / life_h
        t += rng.expovariate(b + d)
        n += 1 if rng.random() < b / (b + d) else -1
    return min(t, horizon)


def harmonic(n):
    return sum(1.0 / k for k in range(1, n + 1))
