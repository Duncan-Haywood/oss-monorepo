"""Hourly on/off schedules for pump 10: feasibility, penalised cost, an exhaustive two-run grid, a local search and a genetic algorithm.

A schedule is a 24-bit mask repeated every day. Hydraulics are nonlinear (EPANET), so this is black-box search, not a MILP:
each evaluation is one three-day EPANET run (about 0.05 s). Feasibility is the one used for windows in `run.py`.
"""
import itertools

import numpy as np

from .sched import cost, simulate_mask, total_kwh

DRIFT_MAX = 0.01
TANK_MARGIN = 0.5
MIN_PRESSURE = 14.06
PENALTY = 1e6  # relative-cost units per violation, far above any feasible cost (a day is ~1,000 to 40,000)


def mask_of(i):
    return tuple(bool((i >> h) & 1) for h in range(24))


def feasible(r):
    return (r["min_pressure"] >= MIN_PRESSURE and r["tank_min_margin"] >= TANK_MARGIN
            and abs(r["drift_m3"]) <= DRIFT_MAX * r["demand_m3"])


def violation(r):
    """0 when feasible, else a positive size so the search can climb out of infeasible masks."""
    v = max(0.0, TANK_MARGIN - r["tank_min_margin"]) + max(0.0, MIN_PRESSURE - r["min_pressure"]) / 10
    v += max(0.0, abs(r["drift_m3"]) / r["demand_m3"] - DRIFT_MAX) * 20
    return v


class Evaluator:
    """Cached, counted simulation of masks. `calls` counts distinct EPANET runs."""

    def __init__(self, store=None):
        self.cache = store if store is not None else {}
        self.calls = 0

    def __call__(self, mask):
        key = tuple(bool(b) for b in mask)
        if key not in self.cache:
            self.calls += 1
            self.cache[key] = simulate_mask(key)
        return self.cache[key]

    def objective(self, mask, price):
        r = self(mask)
        return cost(r, price) + (PENALTY * (1 + violation(r)) if not feasible(r) else 0.0)


def runs_masks():
    """Every mask with at most two cyclic runs of on-hours (one or two windows a day), plus all-off and all-on."""
    out = {tuple([False] * 24), tuple([True] * 24)}
    for k in (2, 4):  # k boundaries on the 24-hour circle: k/2 runs
        for cuts in itertools.combinations(range(24), k):
            m = np.zeros(24, bool)
            for a, b in zip(cuts[0::2], cuts[1::2]):
                m[a:b] = True
            out.add(tuple(bool(x) for x in m))
            out.add(tuple(bool(x) for x in ~m))  # complement: runs that wrap midnight
    return sorted(out)


def local_search(ev, price, start, budget, rng):
    """First-improvement hill climb over single and adjacent-pair bit flips, with random restarts of 3 flips when stuck."""
    cur = list(start)
    f = ev.objective(cur, price)
    best, fb = list(cur), f
    n0 = ev.calls
    while ev.calls - n0 < budget:
        moves = [(i,) for i in range(24)] + [(i, (i + 1) % 24) for i in range(24)]
        rng.shuffle(moves)
        improved = False
        for mv in moves:
            if ev.calls - n0 >= budget:
                break
            cand = list(cur)
            for i in mv:
                cand[i] = not cand[i]
            fc = ev.objective(cand, price)
            if fc < f - 1e-9:
                cur, f, improved = cand, fc, True
                if f < fb:
                    best, fb = list(cur), f
                break
        if not improved:
            cur = list(best)
            for i in rng.choice(24, 3, replace=False):
                cur[i] = not cur[i]
            f = ev.objective(cur, price)
    return tuple(best), fb


def genetic(ev, price, budget, rng, pop=24, seeds=()):
    """Plain GA: tournament selection, uniform crossover, bit-flip mutation (1/24 per bit), one elite, `budget` new evaluations."""
    P = [tuple(s) for s in seeds][:pop]
    while len(P) < pop:
        P.append(tuple(bool(b) for b in rng.random(24) < rng.uniform(0.3, 0.9)))
    n0 = ev.calls
    F = [ev.objective(m, price) for m in P]
    while ev.calls - n0 < budget:
        order = np.argsort(F)
        new = [P[order[0]]]
        while len(new) < pop and ev.calls - n0 < budget + pop:
            a = min(rng.choice(pop, 3, replace=False), key=lambda i: F[i])
            b = min(rng.choice(pop, 3, replace=False), key=lambda i: F[i])
            take = rng.random(24) < 0.5
            child = np.where(take, P[a], P[b])
            child = child ^ (rng.random(24) < 1 / 24)
            new.append(tuple(bool(x) for x in child))
        P = new
        F = [ev.objective(m, price) for m in P]
    i = int(np.argmin(F))
    return P[i], F[i]
