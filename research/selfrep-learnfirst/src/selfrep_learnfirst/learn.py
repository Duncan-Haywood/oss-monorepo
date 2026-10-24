"""Which imported (vitamin) line should a shop learn to make first?

Uses the assumed bill of materials of ``selfrep-closure``. "Learning" a line means it becomes makeable, so its
share of total lines, units, mass or cost moves from imported to made. Gains per line are additive, so the
ranking is a sort; the questions are how the four metrics disagree and whether the mass/cost ranking survives
the assumed numbers being wrong (log-uniform 0.5x to 2x per line, as in ``selfrep-closure``).
"""
import math
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-closure" / "src"))
from selfrep_closure import closure as C  # noqa: E402

SHOP = {"fdm", "cnc", "laser"}
VARIANT = "lm8uu"


def vitamin_lines(variant=VARIANT, shop=SHOP):
    return C.vitamins(variant, shop)


def gains(mass=None, cost=None, variant=VARIANT, shop=SHOP):
    """name -> dict of closure gain (share of the metric's total) from making that one vitamin line."""
    ps = C.parts_for(variant)
    mass = mass or {p.name: p.mass_g for p in ps}
    cost = cost or {p.name: p.cost for p in ps}
    tot = {"lines": len(ps), "units": sum(p.qty for p in ps),
           "mass": sum(p.qty * mass[p.name] for p in ps), "cost": sum(p.qty * cost[p.name] for p in ps)}
    return {p.name: {"lines": 1 / tot["lines"], "units": p.qty / tot["units"],
                     "mass": p.qty * mass[p.name] / tot["mass"], "cost": p.qty * cost[p.name] / tot["cost"]}
            for p in vitamin_lines(variant, shop)}


def ranking(g, metric):
    return sorted(g, key=lambda n: (-g[n][metric], n))


def cumulative(g, metric, order=None):
    """Closure gained by learning lines in ``order`` (default: best first for ``metric``); list of (name, running total)."""
    order = order or ranking(g, metric)
    run, out = 0.0, []
    for n in order:
        run += g[n][metric]
        out.append((n, run))
    return out


def lines_to_reach(g, metric, target):
    """Number of lines learned best-first to gain ``target`` of the metric, or None if the vitamins cannot reach it."""
    for k, (_, run) in enumerate(cumulative(g, metric), 1):
        if run >= target:
            return k
    return None


def kendall_tau(a, b):
    """Kendall tau between two orderings of the same items (no ties in orderings)."""
    pos = {n: i for i, n in enumerate(b)}
    c = d = 0
    for i in range(len(a)):
        for j in range(i + 1, len(a)):
            if pos[a[i]] < pos[a[j]]:
                c += 1
            else:
                d += 1
    return (c - d) / (c + d)


def top_stability(metric, n=2000, spread=(0.5, 2.0), seed=0, variant=VARIANT, shop=SHOP):
    """Fraction of draws in which each line is rank 1, and mean Kendall tau of the draw's ranking to the nominal one."""
    rng = random.Random(seed)
    ps = C.parts_for(variant)
    lo, hi = math.log(spread[0]), math.log(spread[1])
    nominal = ranking(gains(variant=variant, shop=shop), metric)
    wins, taus = {}, []
    for _ in range(n):
        mass = {p.name: p.mass_g * math.exp(rng.uniform(lo, hi)) for p in ps}
        cost = {p.name: p.cost * math.exp(rng.uniform(lo, hi)) for p in ps}
        r = ranking(gains(mass, cost, variant, shop), metric)
        wins[r[0]] = wins.get(r[0], 0) + 1
        taus.append(kendall_tau(nominal, r))
    return {k: v / n for k, v in sorted(wins.items(), key=lambda kv: -kv[1])}, sum(taus) / n


def by_kind(variant=VARIANT, shop=SHOP):
    """Closure gain from making a whole kind (fastener, rod, electronics, ...) of vitamin."""
    kinds = {}
    ps = {p.name: p for p in vitamin_lines(variant, shop)}
    g = gains(variant=variant, shop=shop)
    for n, p in ps.items():
        k = kinds.setdefault(p.kind, {m: 0.0 for m in ("lines", "units", "mass", "cost")})
        for m in k:
            k[m] += g[n][m]
    return kinds
