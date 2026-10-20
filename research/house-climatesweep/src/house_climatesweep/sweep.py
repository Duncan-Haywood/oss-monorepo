"""Sweep climate (HDD65, CDD65) continuously over house-energy's exhaustive NPC search.

house-energy picks the cost-optimal envelope in eight named cities. Here the climate is the axis: for any
(HDD, CDD) pair we find the exact optimum of the 640 packages, and bisect along a line of climates for the
degree-day value at which each upgrade first appears in the optimum. Nothing is added to the physics, so every
caveat of house-energy (unsourced prices, no solar gain, degree-day loads) carries over.

The model is linear in (HDD, CDD) for a fixed package, so each package's NPC is first_cost + a*HDD + b*CDD with
(a, b) precomputed once; an optimum at any climate is then a scan of 640 linear functions.
"""
from house_energy.model import (ANNUITY, SYSTEMS, Package, Prices, evaluate, options)

# the five package dimensions and a rank for each level (higher = more insulation / tighter)
DIMENSIONS = {
    "wall": ("conv 2x4", "conv 2x6", "adv 2x6", "adv 2x6 + R5 foam"),
    "attic_r": (19, 30, 38, 49, 60),
    "window_u": (0.50, 0.35, 0.27, 0.20),
    "ach50": (7.0, 5.0, 3.0, 1.5),
    "slab_r": (0, 10),
}
_COEF = {}


def level(p, dim):
    """Index of package p's choice along a dimension (0 = the cheapest, thinnest option)."""
    return DIMENSIONS[dim].index(getattr(p, dim))


def _coefs(system, prices):
    key = (system, prices)
    if key not in _COEF:
        rows = []
        for p in options():
            fc = evaluate(p, (0, 0), system, prices)["first_cost"]
            a = evaluate(p, (1, 0), system, prices)["annual_cost"] * ANNUITY
            b = evaluate(p, (0, 1), system, prices)["annual_cost"] * ANNUITY
            rows.append((p, fc, a, b))
        _COEF[key] = rows
    return _COEF[key]


def optimum_at(hdd, cdd, system="gas furnace + AC", prices=Prices()):
    """Exact cost-optimal package at a climate, and its NPC."""
    best = min(_coefs(system, prices), key=lambda r: r[1] + r[2] * hdd + r[3] * cdd)
    return best[0], best[1] + best[2] * hdd + best[3] * cdd


def hdd_line(cdd):
    return lambda x: (x, cdd)


def cdd_line(hdd):
    return lambda x: (hdd, x)


def transitions(line, lo, hi, system="gas furnace + AC", prices=Prices(), step=25.0, tol=0.5):
    """Every point x in [lo, hi] where the optimum package changes, as [(x, dim, from_choice, to_choice)].

    The optimum is scanned every `step` degree-days; each cell whose two ends differ is bisected to `tol` until
    the changes separate, so two upgrades that switch inside one cell are reported at their own x. A switch
    pair closer than `tol` is reported at the same x."""
    out = []

    def pkg(x):
        return optimum_at(*line(x), system, prices)[0]

    def split(a, b, pa, pb):
        if pa == pb:
            return
        if b - a <= tol:
            out.extend((b, d, getattr(pa, d), getattr(pb, d)) for d in DIMENSIONS if getattr(pa, d) != getattr(pb, d))
            return
        m = (a + b) / 2
        pm = pkg(m)
        split(a, m, pa, pm)
        split(m, b, pm, pb)

    n = int(round((hi - lo) / step))
    xs = [lo + (hi - lo) * i / n for i in range(n + 1)]
    ps = [pkg(x) for x in xs]
    for i in range(n):
        split(xs[i], xs[i + 1], ps[i], ps[i + 1])
    return sorted(out, key=lambda t: t[0])
