"""Monte Carlo over the energy-lcos model. Stdlib only; deterministic for a given seed.

Each technology input is multiplied by a factor drawn uniformly from an ASSUMED range (RANGES); the discount rate
and charging price are drawn from assumed ranges too. The question is how often each technology is cheapest.
"""
import random
from dataclasses import replace

from energy_lcos import TECHS, lcos

__all__ = ["RANGES", "draw", "sample_techs", "win_shares", "one_at_a_time"]

# ASSUMED multiplicative ranges (low, high) on the base inputs; not taken from a source.
# Mature, site-driven technologies (pumped hydro, caverns) get wider cost ranges than factory-made Li-ion.
RANGES = {
    "li-ion (LFP)": {"energy_cost": (0.5, 1.5), "power_cost": (0.6, 1.6), "rte": (0.95, 1.04)},
    "vanadium flow": {"energy_cost": (0.5, 1.5), "power_cost": (0.6, 1.6), "rte": (0.9, 1.1)},
    "pumped hydro": {"energy_cost": (0.5, 2.0), "power_cost": (0.6, 1.8), "rte": (0.95, 1.05)},
    "compressed air (cavern)": {"energy_cost": (0.5, 2.0), "power_cost": (0.6, 1.8), "rte": (0.9, 1.15)},
    "hydrogen (cavern)": {"energy_cost": (0.5, 2.0), "power_cost": (0.4, 1.6), "rte": (0.85, 1.3)},
}
RATE = (0.03, 0.10)
CHARGE = (10.0, 100.0)


def draw(rng):
    """One scenario: ({name: Tech}, rate, charge_price)."""
    techs = sample_techs(rng)
    return techs, rng.uniform(*RATE), rng.uniform(*CHARGE)


def sample_techs(rng):
    out = {}
    for name, t in TECHS.items():
        kw = {k: getattr(t, k) * rng.uniform(*r) for k, r in RANGES[name].items()}
        out[name] = replace(t, **kw)
    return out


def win_shares(durations, n=2000, seed=0, rate=None, charge=None):
    """{duration: {tech: share of n scenarios in which it has the lowest LCOS}}. rate/charge fix those draws if given."""
    rng = random.Random(seed)
    wins = {d: {k: 0 for k in TECHS} for d in durations}
    for _ in range(n):
        techs, r, c = draw(rng)
        r = rate if rate is not None else r
        c = charge if charge is not None else c
        for d in durations:
            best = min(techs, key=lambda k: lcos(techs[k], d, rate=r, charge_price=c))
            wins[d][best] += 1
    return {d: {k: v / n for k, v in w.items()} for d, w in wins.items()}


def one_at_a_time(name, duration):
    """LCOS of `name` at `duration` with each input moved to the low and high end of its range, others at base.
    Returns {input: (low_lcos, high_lcos)} including 'rate' and 'charge_price'."""
    base = TECHS[name]
    res = {}
    for k, (lo, hi) in RANGES[name].items():
        res[k] = tuple(lcos(replace(base, **{k: getattr(base, k) * f}), duration) for f in (lo, hi))
    res["rate"] = tuple(lcos(base, duration, rate=r) for r in RATE)
    res["charge_price"] = tuple(lcos(base, duration, charge_price=c) for c in CHARGE)
    return res
