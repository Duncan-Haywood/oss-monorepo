import random
from .bom import PARTS, SHOPS


def parts_for(variant):
    return [p for p in PARTS if p.variant in ("all", variant)]


def makeable(part, processes):
    """A part is makeable if some maker is available (a part needing two processes lists them as alternatives
    in ``makers``; for brass bushings both casting and the router are required, handled below)."""
    if not part.makers:
        return False
    if part.name.startswith("8x25 mm brass"):
        return {"cast", "cnc"} <= processes
    return bool(set(part.makers) & processes)


def closure(variant, processes, mass=None, cost=None):
    """Closure by distinct lines, units, mass and cost. ``mass``/``cost`` map part name -> unit value."""
    ps = parts_for(variant)
    mass = mass or {p.name: p.mass_g for p in ps}
    cost = cost or {p.name: p.cost for p in ps}
    tot = {"lines": 0, "units": 0, "mass": 0.0, "cost": 0.0}
    got = dict(tot)
    for p in ps:
        m = makeable(p, processes)
        for k, v in (("lines", 1), ("units", p.qty), ("mass", p.qty * mass[p.name]), ("cost", p.qty * cost[p.name])):
            tot[k] += v
            if m:
                got[k] += v
    return {k: got[k] / tot[k] for k in tot}, tot


def sensitivity(variant, processes, n=2000, spread=(0.5, 2.0), seed=0):
    """Scale every assumed mass and cost by an independent log-uniform factor in ``spread``; return 5/50/95 percentiles."""
    import math
    rng = random.Random(seed)
    ps = parts_for(variant)
    out = {"mass": [], "cost": []}
    lo, hi = math.log(spread[0]), math.log(spread[1])
    for _ in range(n):
        mass = {p.name: p.mass_g * math.exp(rng.uniform(lo, hi)) for p in ps}
        cost = {p.name: p.cost * math.exp(rng.uniform(lo, hi)) for p in ps}
        c, _ = closure(variant, processes, mass, cost)
        out["mass"].append(c["mass"]); out["cost"].append(c["cost"])
    q = lambda xs, f: sorted(xs)[int(f * (len(xs) - 1))]
    return {k: (q(v, .05), q(v, .5), q(v, .95)) for k, v in out.items()}


def vitamins(variant, processes):
    return [p for p in parts_for(variant) if not makeable(p, processes)]


def feedstock(variant, processes):
    return sorted({p.feedstock for p in parts_for(variant) if makeable(p, processes) and p.feedstock})
