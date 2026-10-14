"""Growth of a replicating shop of identical printers under a vitamin-import budget.

Each unit (a printer) repeatedly builds a copy of itself. A build needs ``work_h`` hours of
the unit's time and one copy's worth of vitamins (``vit_cost``, bought from an import stream
of ``budget`` currency units per hour). With probability ``fail`` a build fails when it ends:
the hours and the vitamins are lost and the unit starts again. All parameters are assumptions
of this project (see the README); nothing here is a measurement.
"""
import heapq
import math
import random
from dataclasses import dataclass


@dataclass(frozen=True)
class Params:
    work_h: float      # unit-hours to print and assemble one copy
    vit_cost: float    # imported vitamins per copy (assumed currency units)
    budget: float      # import budget, currency units per hour
    fail: float = 0.0  # probability a build fails (all its vitamins and hours lost)
    cv: float = 0.2    # coefficient of variation of build time (lognormal)
    stock0: float = 0.0  # vitamin stock at t=0


def doubling_time_free(p):
    """Doubling time (h) when vitamins never limit: dN/dt = N (1-fail) / work_h."""
    return p.work_h * math.log(2) / (1 - p.fail)


def crossover_units(p):
    """Fleet size N* above which the import budget, not machine time, limits growth."""
    return p.budget * p.work_h / p.vit_cost


def time_to_reach_ode(p, n0, target):
    """Deterministic fluid model dN/dt = min(N(1-f)/W, B(1-f)/V); closed form, hours."""
    k = (1 - p.fail) / p.work_h
    lin = p.budget * (1 - p.fail) / p.vit_cost
    ns = crossover_units(p)
    if target <= n0:
        return 0.0
    t = 0.0
    n = n0
    if n < ns:
        top = min(target, ns)
        t += math.log(top / n) / k
        n = top
    if target > n:
        t += (target - n) / lin
    return t


def simulate(p, n0=1, target=16, seed=0, t_max=1e7):
    """Stochastic discrete-event run; returns the time (h) the fleet first reaches ``target``."""
    rng = random.Random(seed)
    sig = math.sqrt(math.log(1 + p.cv ** 2))
    mu = math.log(p.work_h) - sig ** 2 / 2

    def dur():
        return rng.lognormvariate(mu, sig) if p.cv > 0 else p.work_h

    stock, t_stock = p.stock0, 0.0
    idle, n = n0, n0
    events = []  # (time, kind)
    try_at = None  # time of the one pending 'try' event
    t = 0.0
    while n < target and t < t_max:
        # start every build the stock allows right now
        stock += p.budget * (t - t_stock)
        t_stock = t
        while idle and stock >= p.vit_cost * (1 - 1e-9):
            stock -= p.vit_cost
            idle -= 1
            heapq.heappush(events, (t + dur(), "done"))
        if idle and p.budget > 0:
            nxt = t + (p.vit_cost - stock) / p.budget
            if try_at is None or try_at <= t:
                try_at = nxt
                heapq.heappush(events, (nxt, "try"))
        if not events:
            return math.inf
        t, kind = heapq.heappop(events)
        if kind == "done":
            if rng.random() < p.fail:
                idle += 1
            else:
                n += 1
                idle += 2  # the finished unit and its new copy
    return t if n >= target else math.inf


def effective_doubling(p, n0=1, target=16, reps=200, seed=0):
    """Median over runs of (time to grow n0 -> target) / log2(target/n0), plus 5th and 95th percentiles."""
    ts = sorted(simulate(p, n0, target, seed + i) for i in range(reps))
    d = math.log2(target / n0)
    q = lambda f: ts[int(f * (len(ts) - 1))] / d
    return q(0.05), q(0.5), q(0.95)
