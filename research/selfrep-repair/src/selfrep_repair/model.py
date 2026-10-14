"""Repair versus replacement in a replicating printer shop (stylised).

Same build rule as ``selfrep-wearout`` / ``selfrep-growth``: a copy needs ``work_h`` unit-hours and ``vit_cost``
imported vitamins, from an import stream ``budget`` per hour. Machines break down at constant rate 1/``life_h``
(exponential; a build in progress is lost with its vitamins). New here: on a breakdown the shop may spend
``repair_cost`` x ``vit_cost`` of spare-part vitamins and ``repair_h`` hours of downtime to repair the machine.
A repair succeeds with probability ``repair_ok`` and the machine is then as good as new; otherwise it is retired.
With too little stock for the spares, the machine is retired; ``reserve`` x ``vit_cost`` of stock is held back
from new builds to make that less likely. ``repair_cost`` < 0 disables repair.

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
    life_h: float            # mean time between breakdowns, hours
    repair_cost: float = -1  # spares as a share of vit_cost; negative = never repair
    repair_h: float = 0.0    # downtime per repair
    repair_ok: float = 1.0   # probability a repair works
    cv: float = 0.2          # lognormal build-time spread
    reserve: float = 0.0     # share of vit_cost held back from builds so spares are on hand for repairs


def repairs(p):
    return p.repair_cost >= 0


def fixed_point(p):
    """Import-limited equilibrium fleet from the vitamin balance B = N (c + 1 - s) V / L (s = 1 - retire chance).

    Replace-only (no repair) is c = 0, s = 0, giving N = B L / V. Ignores builds cut short by breakdowns, the wait
    for stock, downtime and the build-time spread.
    """
    if not repairs(p):
        return p.budget * p.life_h / p.vit_cost
    return p.budget * p.life_h / (p.vit_cost * (p.repair_cost + 1 - p.repair_ok))


def break_even_cost(p):
    """Repair cost share below which repair gives a bigger import-limited fleet than replacement: c* = s."""
    return p.repair_ok


def simulate(p, n0=1, horizon=20000.0, seed=0, grid=200.0):
    """One stochastic run from ``n0`` new machines. Returns working machines (alive and not in repair) every ``grid`` h."""
    rng = random.Random(seed)
    sig = math.sqrt(math.log(1 + p.cv ** 2))
    mu = math.log(p.work_h) - sig ** 2 / 2
    dur = (lambda: rng.lognormvariate(mu, sig)) if p.cv > 0 else (lambda: p.work_h)
    ev, mid = [], 0
    alive, idle, building, fixing = set(), set(), set(), set()
    gen = {}  # invalidates a machine's pending build / breakdown events after it breaks

    def add_machine(t):
        nonlocal mid
        mid += 1
        alive.add(mid)
        idle.add(mid)
        gen[mid] = 0
        heapq.heappush(ev, (t + rng.expovariate(1 / p.life_h), 1, mid, 0))  # kind 1: breakdown

    for _ in range(n0):
        add_machine(0.0)
    stock, t_prev, try_at = 0.0, 0.0, None
    samples, next_s, t = [], 0.0, 0.0
    while t < horizon:
        stock += p.budget * (t - t_prev)
        while next_s <= t and next_s <= horizon:
            samples.append(len(alive) - len(fixing))
            next_s += grid
        t_prev = t
        need = p.vit_cost * (1 + p.reserve)
        while idle and stock >= need * (1 - 1e-9):
            m = idle.pop()
            stock -= p.vit_cost
            building.add(m)
            heapq.heappush(ev, (t + dur(), 0, m, gen[m]))  # kind 0: build done
        if idle and p.budget > 0 and (try_at is None or try_at <= t):
            try_at = t + (need - stock) / p.budget
            heapq.heappush(ev, (try_at, 3, -1, 0))  # kind 3: stock check
        if not ev:
            break
        t, kind, m, g = heapq.heappop(ev)
        if kind in (0, 1, 2) and (m not in alive or g != gen[m]):
            continue
        if kind == 0:
            building.discard(m)
            idle.add(m)
            add_machine(t)
        elif kind == 1:  # breakdown: build in progress is lost; repair if allowed and affordable
            idle.discard(m)
            building.discard(m)
            gen[m] += 1
            spares = p.repair_cost * p.vit_cost
            if repairs(p) and stock >= spares - 1e-9:
                stock -= spares
                fixing.add(m)
                heapq.heappush(ev, (t + p.repair_h, 2, m, gen[m]))  # kind 2: repair done
            else:
                alive.discard(m)
        elif kind == 2:
            fixing.discard(m)
            if rng.random() < p.repair_ok:
                idle.add(m)
                heapq.heappush(ev, (t + rng.expovariate(1 / p.life_h), 1, m, gen[m]))
            else:
                alive.discard(m)
        if not alive:
            break
    while next_s <= horizon:
        samples.append(len(alive) - len(fixing))
        next_s += grid
    return samples


def summarise(p, n0=1, horizon=20000.0, reps=100, seed=0):
    """Fleet averaged over the last quarter of each surviving run: (5th, median, 95th pct, share of runs dead)."""
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
