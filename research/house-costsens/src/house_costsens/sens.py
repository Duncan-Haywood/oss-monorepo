"""Monte Carlo over `house_cost`'s assumed driver splits: does the lever ranking survive?

`house_cost.model.STAGE_DRIVERS` splits each construction stage over drivers (fixed, area, footprint, ...). Those
splits are the model's assumptions. Here each stage's split is redrawn from a Dirichlet centred on the assumed
split with concentration `k` (small k = vague belief, large k = trust the assumption), and the lever swings are
recomputed. The NAHB shares (the anchor) are never changed, so the reference house still prices at exactly 100.
"""
import random
from contextlib import contextmanager

from house_cost import model
from house_cost.model import REFERENCE, price, vary


def draw_drivers(rng, k, base=None):
    """One redrawn STAGE_DRIVERS: per stage, Dirichlet(k * base weights). Single-driver stages are unchanged."""
    base = base or model.STAGE_DRIVERS
    out = {}
    for stage, split in base.items():
        if len(split) == 1:
            out[stage] = dict(split)
            continue
        g = {d: rng.gammavariate(k * w, 1.0) for d, w in split.items()}
        t = sum(g.values())
        out[stage] = {d: v / t for d, v in g.items()}
    return out


@contextmanager
def drivers(split):
    """Temporarily replace the model's STAGE_DRIVERS (the model reads the module global)."""
    saved = dict(model.STAGE_DRIVERS)
    model.STAGE_DRIVERS.clear()
    model.STAGE_DRIVERS.update(split)
    try:
        yield
    finally:
        model.STAGE_DRIVERS.clear()
        model.STAGE_DRIVERS.update(saved)


def swings(levers):
    """Absolute price-index swing of each lever under the current STAGE_DRIVERS."""
    return {name: abs(price(vary(**hi))["price"] - price(vary(**lo))["price"]) for name, lo, hi in levers}


def lumber_value(ratio=0.864, labour=0.8):
    """Price change (% of price) from a framing-lumber cut alone, and with a labour cut too."""
    return (price(vary(framing_materials=ratio))["price"] - 100,
            price(vary(framing_materials=ratio, framing_labour=labour))["price"] - 100)


def run(levers, k, n, seed=0):
    """n draws at concentration k -> list of (swings dict, lumber values)."""
    rng = random.Random(seed)
    res = []
    for _ in range(n):
        with drivers(draw_drivers(rng, k)):
            res.append((swings(levers), lumber_value()))
    return res


def quantile(xs, q):
    s = sorted(xs)
    i = q * (len(s) - 1)
    lo = int(i)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (i - lo)
