"""Repair labour as a constraint on a repairing printer shop (stylised).

Extends ``selfrep-repair``: same build rule (``work_h`` unit-hours and ``vit_cost`` vitamins per copy from an import
stream ``budget`` per hour) and the same breakdown / repair rule. New: repairs are done by ``benches`` repair stations
(labour). A broken machine joins a first-come queue and waits for a free bench; the repair takes ``repair_h`` hours
(exponential with that mean) once on a bench. Spares are bought at the breakdown (``repair_cost`` x ``vit_cost``);
without enough stock the machine is retired, and so is one that finds ``queue_cap`` machines already waiting. ``benches`` = None means unlimited labour (the ``selfrep-repair`` case).
Machines in the queue or on a bench are not working.

All parameters are assumptions of this project; nothing here is a measurement.
"""
import heapq
import math
import random
from collections import deque
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Params:
    work_h: float
    vit_cost: float
    budget: float
    life_h: float
    repair_cost: float = 0.2
    repair_h: float = 50.0
    repair_ok: float = 0.9
    benches: Optional[int] = None
    queue_cap: Optional[int] = None  # retire a broken machine (no spares bought) if this many are already waiting
    cv: float = 0.2
    reserve: float = 1.0


def labour_cap(p):
    """Working fleet at which repair demand N/L fills the benches: N = benches * L / repair_h.

    Needs the repair duty cycle (a working machine breaks at rate 1/L, a bench clears 1/repair_h per hour) and so
    ignores queue waits, build losses and the share of machines that are down.
    """
    if p.benches is None or p.repair_h <= 0:
        return math.inf
    return p.benches * p.life_h / p.repair_h


def import_limit(p):
    """``selfrep-repair`` vitamin balance B = N (c + 1 - s) V / L."""
    return p.budget * p.life_h / (p.vit_cost * (p.repair_cost + 1 - p.repair_ok))


def simulate(p, n0=1, horizon=20000.0, seed=0, grid=200.0):
    """One run. Returns (working, queued_or_in_repair) machine counts every ``grid`` hours."""
    rng = random.Random(seed)
    sig = math.sqrt(math.log(1 + p.cv ** 2))
    mu = math.log(p.work_h) - sig ** 2 / 2
    dur = (lambda: rng.lognormvariate(mu, sig)) if p.cv > 0 else (lambda: p.work_h)
    ev, mid = [], 0
    alive, idle, building = set(), set(), set()
    queue, on_bench = deque(), set()
    gen = {}

    def add_machine(t):
        nonlocal mid
        mid += 1
        alive.add(mid)
        idle.add(mid)
        gen[mid] = 0
        heapq.heappush(ev, (t + rng.expovariate(1 / p.life_h), 1, mid, 0))

    def start_repairs(t):
        while queue and (p.benches is None or len(on_bench) < p.benches):
            m = queue.popleft()
            on_bench.add(m)
            heapq.heappush(ev, (t + (rng.expovariate(1 / p.repair_h) if p.repair_h > 0 else 0.0), 2, m, gen[m]))

    for _ in range(n0):
        add_machine(0.0)
    stock, t_prev, try_at = 0.0, 0.0, None
    work, down, next_s, t = [], [], 0.0, 0.0

    def sample():
        work.append(len(alive) - len(queue) - len(on_bench))
        down.append(len(queue) + len(on_bench))

    while t < horizon:
        stock += p.budget * (t - t_prev)
        while next_s <= t and next_s <= horizon:
            sample()
            next_s += grid
        t_prev = t
        need = p.vit_cost * (1 + p.reserve)
        while idle and stock >= need * (1 - 1e-9):
            m = idle.pop()
            stock -= p.vit_cost
            building.add(m)
            heapq.heappush(ev, (t + dur(), 0, m, gen[m]))
        if idle and p.budget > 0 and (try_at is None or try_at <= t):
            try_at = t + (need - stock) / p.budget
            heapq.heappush(ev, (try_at, 3, -1, 0))
        if not ev:
            break
        t, kind, m, g = heapq.heappop(ev)
        if kind in (0, 1, 2) and (m not in alive or g != gen[m]):
            continue
        if kind == 0:
            building.discard(m)
            idle.add(m)
            add_machine(t)
        elif kind == 1:
            idle.discard(m)
            building.discard(m)
            gen[m] += 1
            spares = p.repair_cost * p.vit_cost
            if stock >= spares - 1e-9 and (p.queue_cap is None or len(queue) < p.queue_cap):
                stock -= spares
                queue.append(m)
                start_repairs(t)
            else:
                alive.discard(m)
        elif kind == 2:
            on_bench.discard(m)
            if rng.random() < p.repair_ok:
                idle.add(m)
                heapq.heappush(ev, (t + rng.expovariate(1 / p.life_h), 1, m, gen[m]))
            else:
                alive.discard(m)
            start_repairs(t)
        if not alive:
            break
    while next_s <= horizon:
        sample()
        next_s += grid
    return work, down


def summarise(p, n0=1, horizon=20000.0, reps=60, seed=0):
    """Tail-quarter means over surviving runs: (median working, median down, share of runs dead)."""
    ws, ds, dead = [], [], 0
    for i in range(reps):
        w, d = simulate(p, n0, horizon, seed + i)
        if w[-1] == 0 and d[-1] == 0:
            dead += 1
            continue
        k = 3 * len(w) // 4
        ws.append(sum(w[k:]) / len(w[k:]))
        ds.append(sum(d[k:]) / len(d[k:]))
    ws.sort()
    ds.sort()
    med = (lambda a: a[len(a) // 2]) if ws else (lambda a: 0.0)
    return med(ws), med(ds), dead / reps
