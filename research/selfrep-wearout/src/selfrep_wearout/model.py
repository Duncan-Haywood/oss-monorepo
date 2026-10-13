"""Replicating printer shop whose machines wear out (stylised).

Extends the fleet model of ``selfrep-growth`` (same build rule: ``work_h`` unit-hours and ``vit_cost``
imported vitamins per copy, import stream ``budget`` per hour, failed builds lose both) with two things:

* every machine has a random lifetime (Weibull, mean ``life_h``, shape ``shape``) and is retired at its end;
  a build in progress on a retiring machine is lost with its vitamins;
* a retired machine returns ``recycle`` x ``vit_cost`` of vitamin value to the stock (recovered parts).

All parameters are assumptions of this project; nothing here is a measurement.
"""
import heapq
import math
import random
from dataclasses import dataclass


@dataclass(frozen=True)
class Params:
    work_h: float
    vit_cost: float
    budget: float
    life_h: float          # mean machine lifetime, hours
    shape: float = 1.0     # Weibull shape: 1 = constant hazard, >1 = wear-out
    fail: float = 0.0      # probability a finished build is bad (hours and vitamins lost)
    recycle: float = 0.0   # share of vit_cost recovered into stock when a machine retires
    cv: float = 0.2        # lognormal build-time spread


def survives(p):
    """Machine-limited growth is possible iff a machine makes more than one copy per lifetime."""
    return p.life_h * (1 - p.fail) > p.work_h


def fluid_fixed_point(p):
    """Import-limited equilibrium of dN/dt = (1-f)(B + rho V N/L)/V - N/L (fluid, exponential life)."""
    den = p.vit_cost * (1 - p.recycle * (1 - p.fail))
    return (1 - p.fail) * p.budget * p.life_h / den


def interrupted_fixed_point(p):
    """Equilibrium that also charges for builds cut short by retirement (exponential life).

    A build of length ``work_h`` is interrupted with probability q = 1 - exp(-work_h/life_h); its vitamins are
    spent and no copy appears. With equal births and retirements (b per hour) the stock balance
    B + rho V b = V b / ((1-f)(1-q)) gives N = b L. Ignores the wait for stock and the build-time spread.
    """
    q = 1 - math.exp(-p.work_h / p.life_h)
    return p.budget * p.life_h / (p.vit_cost * (1 / ((1 - p.fail) * (1 - q)) - p.recycle))


def fluid_trajectory(p, n0=1.0, horizon=20000.0, dt=1.0):
    """Euler integration of dN/dt = min((1-f)N/W, (1-f)(B+rho V N/L)/V) - N/L; returns N(horizon)."""
    n = n0
    for _ in range(int(horizon / dt)):
        make = min((1 - p.fail) * n / p.work_h,
                   (1 - p.fail) * (p.budget + p.recycle * p.vit_cost * n / p.life_h) / p.vit_cost)
        n = max(n + dt * (make - n / p.life_h), 0.0)
    return n


def _weibull_scale(p):
    return p.life_h / math.gamma(1 + 1 / p.shape)


def simulate(p, n0=1, horizon=20000.0, seed=0, grid=200.0):
    """One stochastic run from ``n0`` new machines. Returns a list of fleet sizes sampled every ``grid`` h."""
    rng = random.Random(seed)
    sig = math.sqrt(math.log(1 + p.cv ** 2))
    mu = math.log(p.work_h) - sig ** 2 / 2
    dur = (lambda: rng.lognormvariate(mu, sig)) if p.cv > 0 else (lambda: p.work_h)
    scale = _weibull_scale(p)
    ev, mid = [], 0
    alive, idle, building = set(), set(), set()

    def add_machine(t):
        nonlocal mid
        mid += 1
        alive.add(mid)
        idle.add(mid)
        heapq.heappush(ev, (t + rng.weibullvariate(scale, p.shape), 1, mid))  # kind 1: retire
        return mid

    for _ in range(n0):
        add_machine(0.0)
    stock, t_prev, try_at = 0.0, 0.0, None
    samples, next_s, t = [], 0.0, 0.0
    while t < horizon:
        stock += p.budget * (t - t_prev)
        while next_s <= t and next_s <= horizon:
            samples.append(len(alive))
            next_s += grid
        t_prev = t
        while idle and stock >= p.vit_cost * (1 - 1e-9):
            m = idle.pop()
            stock -= p.vit_cost
            building.add(m)
            heapq.heappush(ev, (t + dur(), 0, m))  # kind 0: build done
        if idle and p.budget > 0 and (try_at is None or try_at <= t):
            try_at = t + (p.vit_cost - stock) / p.budget
            heapq.heappush(ev, (try_at, 2, -1))  # kind 2: stock check
        if not ev:
            break
        t, kind, m = heapq.heappop(ev)
        if kind == 0 and m in alive:
            building.discard(m)
            idle.add(m)
            if rng.random() >= p.fail:
                add_machine(t)
        elif kind == 1 and m in alive:
            alive.discard(m)
            idle.discard(m)
            building.discard(m)
            stock += p.recycle * p.vit_cost
        if not alive:
            break
    while next_s <= horizon:
        samples.append(len(alive))
        next_s += grid
    return samples


def summarise(p, n0=1, horizon=20000.0, reps=100, seed=0):
    """Fleet size averaged over the last quarter of each run that still has machines.

    Returns (5th, median, 95th percentile over surviving runs, share of runs that died out). Averaging only the
    survivors separates the extinction risk from the size of a fleet that took hold.
    """
    means, dead = [], 0
    for i in range(reps):
        s = simulate(p, n0, horizon, seed + i)
        if s[-1] == 0:
            dead += 1
            continue
        tail = s[3 * len(s) // 4:]
        means.append(sum(tail) / len(tail))
    means.sort()
    q = (lambda f: means[int(f * (len(means) - 1))]) if means else (lambda f: 0.0)
    return q(0.05), q(0.5), q(0.95), dead / reps
