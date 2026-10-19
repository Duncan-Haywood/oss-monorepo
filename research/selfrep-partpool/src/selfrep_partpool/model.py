"""Part-level growth of a replicating printer shop: does pooling part jobs beat one-copy-per-printer?

``selfrep-growth`` treats a copy as one 50 h job done start to finish by one printer. Here a copy is the
real list of printed parts of the Prusa Mendel (``selfrep-closure``, 44 printed parts) plus an assembly
step, and the fleet's printers take those jobs under one of three policies:

* ``whole``  - each free printer opens its own copy and does all its parts and its assembly (the
  ``selfrep-growth`` assumption, re-simulated here with the same noise so the comparison is like for like).
* ``focus``  - printers share one pool and always take a part of the OLDEST copy that still has unstarted
  parts, so copies finish one after another and each new printer joins the pool at once.
* ``spread`` - printers take a part of the copy with the fewest started parts, so all copies in flight
  advance together and finish at about the same time (generations).

At most ``N`` copies (the current fleet size) are in flight in the pooled policies. Vitamins (``vit_cost``)
are drawn from a stock fed at ``budget`` per hour when an assembly starts. A finished assembly adds one
printer. All inputs are assumptions of this project (see the README); nothing here is a measurement.
"""
import heapq
import math
import pathlib
import random
import sys
from dataclasses import dataclass

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-closure" / "src"))
from selfrep_closure.bom import SHOPS  # noqa: E402
from selfrep_closure.closure import closure, makeable, parts_for  # noqa: E402

PRINT_G_PER_H = 25.0   # ASSUMED sustained FDM throughput (same as selfrep-growth)
ASSEMBLY_H = 6.0       # ASSUMED printer-hours to assemble and calibrate a copy (same as selfrep-growth)
POLICIES = ("whole", "focus", "spread")


def part_hours(variant="lm8uu", shop="printer"):
    """Mean print hours of every printed part of one copy (one entry per physical part) and vitamin cost."""
    procs = SHOPS[shop]
    hours = []
    for p in parts_for(variant):
        if makeable(p, procs):
            hours += [p.mass_g / PRINT_G_PER_H] * p.qty
    c, tot = closure(variant, procs)
    return hours, (1 - c["cost"]) * tot["cost"]


@dataclass(frozen=True)
class Params:
    parts: tuple            # mean print hours of each part job of one copy
    asm_h: float            # mean assembly hours
    vit_cost: float         # imported vitamins per copy
    budget: float           # vitamin import, currency units per hour
    cv: float = 0.2         # coefficient of variation of every job (lognormal)


def default_params(budget, cv=0.2):
    hours, v = part_hours()
    return Params(tuple(hours), ASSEMBLY_H, v, budget, cv)


class _Copy:
    __slots__ = ("todo", "running", "owner", "assembling")

    def __init__(self, n):
        self.todo = n        # part jobs not started
        self.running = 0     # part jobs in progress
        self.owner = None    # worker id (policy whole)
        self.assembling = False


def simulate(p, policy, n0=1, target=64, seed=0, t_max=1e7):
    """Time (h) at which the fleet first reaches ``target`` printers; ``inf`` if it never does."""
    if policy not in POLICIES:
        raise ValueError(policy)
    rng = random.Random(seed)
    sig = math.sqrt(math.log(1 + p.cv ** 2)) if p.cv > 0 else 0.0

    def dur(mean):
        return rng.lognormvariate(math.log(mean) - sig ** 2 / 2, sig) if sig else mean

    nparts = len(p.parts)
    mean_part = sum(p.parts) / nparts          # parts are identical in the BOM; kept as a mean
    n, t, stock, t_stock = n0, 0.0, 0.0, 0.0
    free = list(range(n0))                      # free worker ids
    wcopy = {}                                  # worker id -> its own copy (whole)
    copies = []                                 # copies in flight (pooled), oldest first
    events, nxt_id, try_at = [], n0, None

    def start_part(w, c):
        c.todo -= 1
        c.running += 1
        heapq.heappush(events, (t + dur(mean_part), "part", w, c))

    def start_asm(w, c):
        nonlocal stock
        stock -= p.vit_cost
        c.assembling = True
        heapq.heappush(events, (t + dur(p.asm_h), "asm", w, c))

    while n < target and t < t_max:
        stock += p.budget * (t - t_stock)
        t_stock = t
        waiting = False
        if policy == "whole":
            for w in list(free):
                c = wcopy.get(w)
                if c is None:
                    c = wcopy[w] = _Copy(nparts)
                if c.todo:
                    free.remove(w)
                    start_part(w, c)
                elif not c.running:
                    if stock >= (p.vit_cost - 1e-6):
                        free.remove(w)
                        start_asm(w, c)
                    else:
                        waiting = True
        else:
            progress = True
            while free and progress:
                progress = False
                ready = [c for c in copies if not c.todo and not c.running and not c.assembling]
                if ready:                       # assembly first
                    if stock >= (p.vit_cost - 1e-6):
                        start_asm(free.pop(), ready[0])
                        progress = True
                        continue
                    waiting = True
                open_parts = [c for c in copies if c.todo]
                if open_parts and (policy == "focus" or len(copies) >= n):
                    c = open_parts[0] if policy == "focus" else min(open_parts, key=lambda c: nparts - c.todo)
                elif len(copies) < n:
                    c = _Copy(nparts)
                    copies.append(c)
                else:
                    break
                start_part(free.pop(), c)
                progress = True
        if waiting and p.budget > 0 and (try_at is None or try_at <= t):
            try_at = t + max(((p.vit_cost - 1e-6) - stock) / p.budget, 1e-6)
            heapq.heappush(events, (try_at, "try", None, None))
        if not events:
            return math.inf
        t, kind, w, c = heapq.heappop(events)
        if kind == "part":
            c.running -= 1
            if policy == "whole":
                free.append(w)
            else:
                free.append(w)
        elif kind == "asm":
            n += 1
            if policy == "whole":
                del wcopy[w]
                free.append(w)
            else:
                copies.remove(c)
                free.append(w)
            free.append(nxt_id)
            nxt_id += 1
    return t if n >= target else math.inf


def effective_doubling(p, policy, n0=1, target=64, reps=100, seed=0):
    """(5th, median, 95th percentile) of time(n0 -> target) / log2(target/n0) over ``reps`` runs."""
    ts = sorted(simulate(p, policy, n0, target, seed + i) for i in range(reps))
    d = math.log2(target / n0)
    q = lambda f: ts[int(f * (len(ts) - 1))] / d
    return q(0.05), q(0.5), q(0.95)
