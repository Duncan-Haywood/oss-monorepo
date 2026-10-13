"""Choosing which machines to add to a seed shop for the most closure.

Builds on the part model of ``research/selfrep-closure`` (imported, not copied). A machine adds one
process; the printer (``fdm``) is always present. Machine prices are ASSUMED placeholders.
"""
import itertools
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-closure" / "src"))
from selfrep_closure.closure import closure  # noqa: E402

# machine -> (process it adds, assumed price in arbitrary currency units)
MACHINES = {"cnc router": ("cnc", 800.0), "laser cutter": ("laser", 600.0), "casting setup": ("cast", 300.0)}


def gain(base, procs, value):
    """``value``: function(process set) -> scalar closure."""
    return value(procs) - value(base)


def exhaustive(machines, budget, value, base=frozenset({"fdm"})):
    """Best subset of machines with total price <= budget (ties: cheaper, then alphabetical)."""
    names = sorted(machines)
    best = ((-1.0, 0.0, ()), ())
    for r in range(len(names) + 1):
        for sub in itertools.combinations(names, r):
            price = sum(machines[n][1] for n in sub)
            if price > budget:
                continue
            v = value(base | {machines[n][0] for n in sub})
            key = (v, -price, tuple(-ord(c) for c in "".join(sub)))
            if key > best[0]:
                best = (key, sub)
    return list(best[1])


def greedy(machines, budget, value, base=frozenset({"fdm"})):
    """Repeatedly add the affordable machine with the best marginal closure per price; stop when no
    affordable machine has a positive marginal gain."""
    procs, chosen, spent = set(base), [], 0.0
    while True:
        cands = []
        for n in sorted(machines):
            p, price = machines[n]
            if n in chosen or spent + price > budget:
                continue
            g = value(procs | {p}) - value(procs)
            if g > 1e-12:
                cands.append((g / price, n))
        if not cands:
            return chosen
        _, n = max(cands)
        chosen.append(n)
        procs.add(machines[n][0])
        spent += machines[n][1]


def printer_value(variant, metric):
    return lambda procs: closure(variant, set(procs))[0][metric]


def random_instance(rng, n_machines=8, n_parts=40, n_procs=6):
    """Synthetic instance: each part needs ALL processes in one of up to two alternative sets;
    each machine adds one process (several machines may add the same one)."""
    procs = [f"p{i}" for i in range(n_procs)]
    machines = {f"m{i}": (rng.choice(procs), round(rng.uniform(100, 1000))) for i in range(n_machines)}
    parts = []
    for _ in range(n_parts):
        alts = [frozenset(rng.sample(procs, rng.choice((1, 1, 2, 3)))) for _ in range(rng.choice((1, 2)))]
        parts.append((rng.uniform(0.5, 5.0), alts))

    def value(ps):
        tot = sum(w for w, _ in parts)
        return sum(w for w, alts in parts if any(a <= ps for a in alts)) / tot
    return machines, value
