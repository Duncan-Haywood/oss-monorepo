"""Which process *capabilities* should a replicating shop learn, when one capability unlocks several imported parts?

``selfrep-learnfirst`` ranks single imported lines as if each could be learned alone and for free. Here a line is made
by a set of capabilities (a lathe with taps and dies, heat treatment, winding, ...), each with an ASSUMED development
effort. A capability is paid once however many lines use it, so the choice is a small set-cover problem: with at most 9
capabilities, all 512 subsets are enumerated exactly. Imported inputs of a made line (steel stock, magnet wire,
magnets) stay imported, as filament does for printed parts in ``selfrep-closure``.
"""
import itertools
import math
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-learnfirst" / "src"))
from selfrep_learnfirst import learn as L  # noqa: E402

# ASSUMED effort to bring each capability up in the shop, arbitrary units (roughly person-weeks). Not sourced.
CAPS = {"lathe": 4.0, "heat-treat": 3.0, "grinding": 6.0, "ball-forming": 5.0, "winding": 5.0,
        "stamping": 3.0, "belt-casting": 5.0, "tube-extrusion": 2.0, "glass-casting": 7.0}

# ASSUMED capabilities each imported line needs (all of them). None = out of reach for a small shop (integrated circuits).
REQ = {"controller electronics": None,
       "NEMA17 stepper motor": {"winding", "stamping"}, "thermistor + heater": {"winding"},
       "end-stop switch (inferred from 3 holders)": {"stamping"},
       "hot end (e.g. J-head)": {"lathe", "heat-treat"}, "M8x50 hobbed bolt": {"lathe", "heat-treat"},
       "LM8UU linear bearing": {"grinding", "heat-treat", "ball-forming"},
       "608 bearing": {"grinding", "heat-treat", "ball-forming"},
       "350 mm 8 mm smooth rod": {"grinding", "heat-treat"}, "405 mm 8 mm smooth rod": {"grinding", "heat-treat"},
       "420 mm 8 mm smooth rod": {"grinding", "heat-treat"},
       "840 mm GT2 belt": {"belt-casting"}, "900 mm GT2 belt": {"belt-casting"},
       "vinyl tubing 1.5 cm": {"tube-extrusion"}, "glass / mirror bed": {"glass-casting"}}
LATHE_ONLY = ("M8 nut", "M3x20 bolt", "M3 nut", "M3x10 bolt", "M3x8 grub screw", "M8x50 grub screw / rod",
              "M3x10 bolt (extruder)", "M3x40 bolt (extruder)", "M3x8 grub screw (extruder)",
              "M8x20 grub screw / rod (extruder)", "370 mm M8 threaded rod", "294 mm M8 threaded rod",
              "440 mm M8 threaded rod", "210 mm M8 threaded rod")
REQ.update({n: {"lathe"} for n in LATHE_ONLY})
METRICS = ("lines", "units", "mass", "cost")


def check():
    """Every imported line has a requirement entry and every requirement names a known capability."""
    names = {p.name for p in L.vitamin_lines()}
    assert names == set(REQ), (names ^ set(REQ))
    assert all(r <= set(CAPS) for r in REQ.values() if r is not None)


def unlocked(caps):
    return [n for n, r in REQ.items() if r is not None and r <= set(caps)]


def total_cost(caps, costs=CAPS):
    return sum(costs[c] for c in caps)


def gain(caps, metric, g=None):
    g = g or L.gains()
    return sum(g[n][metric] for n in unlocked(caps))


def subsets():
    ks = sorted(CAPS)
    for r in range(len(ks) + 1):
        yield from (frozenset(s) for s in itertools.combinations(ks, r))


def best_for_budget(metric, budget, costs=CAPS, g=None):
    """Exact optimum: the capability set within ``budget`` with the most closure (ties: cheaper, then alphabetical)."""
    g = g or L.gains()
    best = max((s for s in subsets() if total_cost(s, costs) <= budget + 1e-9),
               key=lambda s: (round(gain(s, metric, g), 12), -total_cost(s, costs), tuple(sorted(s, reverse=True))))
    return best, gain(best, metric, g)


def frontier(metric, costs=CAPS, g=None):
    """Efficient points (budget, gain, capabilities): the cheapest set reaching each new best gain."""
    g = g or L.gains()
    pts, top = [], -1.0
    for s in sorted(subsets(), key=lambda s: (total_cost(s, costs), sorted(s))):
        v = gain(s, metric, g)
        if v > top + 1e-12:
            pts.append((total_cost(s, costs), v, s))
            top = v
    return pts


def line_rule(metric, budget, order="ratio", costs=CAPS, g=None):
    """Baseline that picks LINES one at a time, best first, paying the real marginal capability cost.

    order "ratio": gain divided by the line's stand-alone effort (sum of its capabilities, sharing ignored).
    order "gain": raw gain, as ``selfrep-learnfirst`` ranks them.  A line is skipped if it no longer fits the budget.
    """
    g = g or L.gains()
    cand = [n for n, r in REQ.items() if r is not None]
    key = (lambda n: (-g[n][metric] / total_cost(REQ[n], costs), n)) if order == "ratio" else (lambda n: (-g[n][metric], n))
    have = set()
    for n in sorted(cand, key=key):
        extra = REQ[n] - have
        if total_cost(have | extra, costs) <= budget + 1e-9:
            have |= extra
    return frozenset(have), gain(have, metric, g)


def stability(metric, budget, n=2000, spread=(0.5, 2.0), seed=0):
    """Scale every capability's effort by an independent log-uniform factor; compare the nominal choice to each draw's optimum.

    Returns (share of draws where the nominal set is still affordable and optimal, mean regret in closure points of
    the nominal set where affordable, share of draws where it is no longer affordable).
    """
    rng = random.Random(seed)
    g = L.gains()
    nominal, _ = best_for_budget(metric, budget, CAPS, g)
    lo, hi = math.log(spread[0]), math.log(spread[1])
    same = over = 0
    regret = []
    for _ in range(n):
        costs = {c: v * math.exp(rng.uniform(lo, hi)) for c, v in CAPS.items()}
        opt, ov = best_for_budget(metric, budget, costs, g)
        if total_cost(nominal, costs) > budget + 1e-9:
            over += 1
            continue
        regret.append(ov - gain(nominal, metric, g))
        same += regret[-1] < 1e-9
    k = n - over
    return same / n, (sum(regret) / k if k else float("nan")), over / n
