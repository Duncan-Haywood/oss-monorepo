"""Die yield models, dies per wafer, cost per good die and the chiplet break-even. Standard library only."""
import math

__all__ = ["poisson", "murphy", "seeds", "bose_einstein", "neg_binomial", "MODELS", "dies_per_wafer",
           "dies_per_wafer_exact", "good_die_cost", "chiplet_cost", "breakeven_area", "RETICLE_MM2"]

RETICLE_MM2 = 26.0 * 33.0  # full-field scanner exposure, 858 mm2


def poisson(x, **_):
    """Y = exp(-A D0); x = A * D0 with A in cm2 and D0 in /cm2."""
    return math.exp(-x)


def murphy(x, **_):
    """Murphy (1964) triangular defect-density distribution."""
    return 1.0 if x == 0 else ((1 - math.exp(-x)) / x) ** 2


def seeds(x, **_):
    """Seeds (1967) exponential defect-density distribution."""
    return 1.0 / (1 + x)


def bose_einstein(x, n=10, **_):
    """Bose-Einstein with n critical layers: each layer sees x/n."""
    return (1 + x / n) ** -n


def neg_binomial(x, alpha=3.0, **_):
    """Negative binomial (Stapper): alpha is the clustering parameter; alpha -> inf is Poisson."""
    return (1 + x / alpha) ** -alpha


MODELS = {"poisson": poisson, "murphy": murphy, "seeds": seeds, "bose_einstein": bose_einstein,
          "neg_binomial": neg_binomial}


def dies_per_wafer(area_mm2, wafer_mm=300.0, edge_mm=3.0):
    """Gross dies: wafer area / die area minus an edge-loss term (the textbook closed form)."""
    d = wafer_mm - 2 * edge_mm
    return max(0, int(math.pi * (d / 2) ** 2 / area_mm2 - math.pi * d / math.sqrt(2 * area_mm2)))


def dies_per_wafer_exact(w_mm, h_mm, wafer_mm=300.0, edge_mm=3.0, steps=40):
    """Count whole w x h dies inside the usable circle, best over a grid of offsets."""
    r = wafer_mm / 2 - edge_mm
    best = 0
    for i in range(steps):
        for j in range(steps):
            ox, oy = w_mm * i / steps, h_mm * j / steps
            n = 0
            kx = int(2 * r / w_mm) + 3
            ky = int(2 * r / h_mm) + 3
            for a in range(-kx, kx):
                x0 = a * w_mm + ox
                for b in range(-ky, ky):
                    y0 = b * h_mm + oy
                    if all(x * x + y * y <= r * r for x in (x0, x0 + w_mm) for y in (y0, y0 + h_mm)):
                        n += 1
            best = max(best, n)
    return best


def good_die_cost(area_mm2, wafer_cost, d0_cm2, model="neg_binomial", **kw):
    """Wafer cost over expected good dies."""
    n = dies_per_wafer(area_mm2)
    if n == 0:
        return math.inf
    y = MODELS[model](area_mm2 / 100.0 * d0_cm2, **kw)
    return wafer_cost / (n * y)


def chiplet_cost(area_mm2, n, wafer_cost, d0_cm2, overhead=0.10, pkg=0.0, bond=0.0, bond_yield=0.99,
                 model="neg_binomial", **kw):
    """Cost of a design of `area_mm2` of logic split into n chiplets.

    Each chiplet carries `overhead` extra area (die-to-die PHY); dies are tested before assembly (known good die);
    assembly costs `pkg` once and `bond` per chiplet, and each bond succeeds with `bond_yield`, so a failed
    assembly loses all n dies. n = 1 is the monolithic die with no overhead and `pkg` as its package.
    """
    if n == 1:
        return (good_die_cost(area_mm2, wafer_cost, d0_cm2, model, **kw) + pkg) / bond_yield
    a = area_mm2 * (1 + overhead) / n
    die = good_die_cost(a, wafer_cost, d0_cm2, model, **kw)
    return (n * die + pkg + n * bond) / bond_yield ** n


def breakeven_area(n, wafer_cost, d0_cm2, lo=50.0, hi=RETICLE_MM2, **kw):
    """Smallest logic area (mm2) at which n chiplets cost less than one die, or None inside [lo, hi]."""
    def gain(a):
        return chiplet_cost(a, 1, wafer_cost, d0_cm2, **kw) - chiplet_cost(a, n, wafer_cost, d0_cm2, **kw)
    if gain(hi) < 0:
        return None
    if gain(lo) >= 0:
        return lo
    for _ in range(60):
        mid = (lo + hi) / 2
        if gain(mid) >= 0:
            hi = mid
        else:
            lo = mid
    return hi
