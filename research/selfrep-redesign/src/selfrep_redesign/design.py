"""Design substitutions that turn vitamin lines of the selfrep-closure Prusa Mendel into makeable ones.

Every substitution here is an ASSUMPTION of this project: which parts could be replaced, by what, and the
``penalty`` (0 to 1, an arbitrary unit of lost performance or durability) are judgements, not measurements.
Replacement parts reuse the assumed masses and costs style of selfrep-closure.
"""
import itertools
import pathlib
import random
import sys
from dataclasses import dataclass, replace

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-closure" / "src"))
from selfrep_closure.bom import PARTS, Part, SHOPS  # noqa: E402
from selfrep_closure.closure import makeable  # noqa: E402


@dataclass(frozen=True)
class Sub:
    name: str
    removes: tuple           # part names dropped (variant lm8uu)
    adds: tuple              # replacement Part lines
    penalty: float           # ASSUMED loss, arbitrary units


def _printed(name, qty, mass):
    return Part(name, qty, "printed", mass, 0.5, ("fdm",), "assumed substitute", feedstock="filament")


SUBS = [
    Sub("printed-bushings", ("LM8UU linear bearing",), (_printed("printed bushing", 10, 6.0),), 0.5),
    Sub("printed-idlers", ("608 bearing",), (_printed("printed idler bushing", 6, 8.0),), 0.4),
    Sub("printed-m8-nuts", ("M8 nut",), (_printed("printed M8 nut", 100, 1.5),), 0.3),
    Sub("printed-m3-nuts", ("M3 nut",), (_printed("printed M3 nut", 50, 0.3),), 0.3),
    Sub("wood-smooth-rods", ("350 mm 8 mm smooth rod", "405 mm 8 mm smooth rod", "420 mm 8 mm smooth rod"),
        (Part("dowel rod 8 mm", 6, "rod", 30.0, 0.3, ("cnc",), "assumed: dowel cut on router", feedstock="wood dowel"),), 0.9),
    Sub("printed-belt-drive", ("840 mm GT2 belt", "900 mm GT2 belt"),
        (_printed("printed chain drive", 2, 60.0),), 0.8),
    Sub("printed-hobbed-bolt", ("M8x50 hobbed bolt",), (_printed("printed drive gear", 1, 10.0),), 0.7),
]


def design(chosen):
    """Part list (LM8UU variant) after applying the substitutions whose indices are in ``chosen``."""
    drop = {n for i in chosen for n in SUBS[i].removes}
    parts = [p for p in PARTS if p.variant in ("all", "lm8uu") and p.name not in drop]
    for i in chosen:
        parts += list(SUBS[i].adds)
    return parts


def closure_of(parts, processes, metric):
    tot = got = 0.0
    for p in parts:
        w = {"lines": 1, "units": p.qty, "mass": p.qty * p.mass_g, "cost": p.qty * p.cost}[metric]
        tot += w
        if makeable(p, processes):
            got += w
    return got / tot


def penalty(chosen):
    return sum(SUBS[i].penalty for i in chosen)


def exhaustive(budget, procs, metric):
    best, bs = (), closure_of(design(()), procs, metric)
    for r in range(1, len(SUBS) + 1):
        for c in itertools.combinations(range(len(SUBS)), r):
            if penalty(c) <= budget:
                v = closure_of(design(c), procs, metric)
                if v > bs + 1e-12:
                    best, bs = c, v
    return best, bs


def greedy(budget, procs, metric):
    chosen, v = [], closure_of(design(()), procs, metric)
    while True:
        cand = []
        for i in range(len(SUBS)):
            if i in chosen or penalty(chosen + [i]) > budget:
                continue
            g = closure_of(design(chosen + [i]), procs, metric) - v
            if g > 1e-12:
                cand.append((g / SUBS[i].penalty, i))
        if not cand:
            return tuple(chosen), v
        _, i = max(cand)
        chosen.append(i)
        v = closure_of(design(chosen), procs, metric)


def random_search(budget, procs, metric, evals, rng):
    best, bs = (), closure_of(design(()), procs, metric)
    for _ in range(evals):
        c = tuple(i for i in range(len(SUBS)) if rng.random() < 0.5)
        if penalty(c) <= budget:
            v = closure_of(design(c), procs, metric)
            if v > bs:
                best, bs = c, v
    return best, bs


def vitamin_kinds(parts, procs):
    return sum(1 for p in parts if not makeable(p, procs))
