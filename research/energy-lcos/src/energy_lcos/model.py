"""Levelised cost of storage (LCOS) by technology and duration. Stdlib only.

A store of rated discharge power P (kW) and duration D (h) holds E = P*D kWh. It is cycled
`cycles_per_year(D)` times a year, each cycle delivering the (faded) usable energy.

LCOS ($/MWh delivered) = (annualised capital + fixed O&M + charging electricity) / MWh delivered a year,
all discounted over the life, where life = min(calendar life, cycle life / cycles per year).
"""
from dataclasses import dataclass, replace

__all__ = ["Tech", "TECHS", "crf", "life_years", "cycles_per_year", "lcos", "winner", "crossover", "capex"]


@dataclass(frozen=True)
class Tech:
    name: str
    energy_cost: float   # $/kWh of storage capacity (installed)
    power_cost: float    # $/kW of discharge power (installed)
    rte: float           # round-trip efficiency, AC to AC
    life: float          # calendar life, years
    cycle_life: float    # full cycles before end of life
    fade: float          # capacity lost per year (fraction of original)
    fom: float           # fixed O&M, $/kW-year


# ASSUMED round, typical values for a utility-scale system, NOT checked against a primary source in this run.
# Hydrogen's power cost is per kW of discharge, covering electrolyser plus fuel cell or turbine.
TECHS = {
    "li-ion (LFP)": Tech("li-ion (LFP)", 200, 100, 0.85, 15, 6000, 0.015, 8),
    "vanadium flow": Tech("vanadium flow", 300, 600, 0.70, 20, 15000, 0.005, 10),
    "pumped hydro": Tech("pumped hydro", 30, 1500, 0.78, 50, 50000, 0.0, 15),
    "compressed air (cavern)": Tech("compressed air (cavern)", 10, 1000, 0.55, 40, 20000, 0.0, 15),
    "hydrogen (cavern)": Tech("hydrogen (cavern)", 3, 1800, 0.35, 25, 10000, 0.0, 25),
}


def crf(rate, years):
    """Capital recovery factor: annual payment per $ of capital."""
    if rate == 0:
        return 1.0 / years
    return rate * (1 + rate) ** years / ((1 + rate) ** years - 1)


def cycles_per_year(duration, hours_budget=2000.0, cap=365.0):
    """Full cycles a year for a store of this duration: a fixed discharge-hours budget, at most one a day."""
    return min(cap, hours_budget / duration)


def life_years(t, cycles):
    return min(t.life, t.cycle_life / cycles)


def capex(t, duration):
    """Installed cost per kW of discharge power at this duration."""
    return t.power_cost + t.energy_cost * duration


def lcos(t, duration, rate=0.07, charge_price=30.0, hours_budget=2000.0):
    """$/MWh delivered, discounted over the life. charge_price is $/MWh bought to charge (0 gives storage cost alone)."""
    c = cycles_per_year(duration, hours_budget)
    n = life_years(t, c)
    pv_cost = capex(t, duration)
    pv_mwh = 0.0
    full = int(n)
    for y in range(1, full + 2):
        frac = 1.0 if y <= full else n - full
        if frac <= 0:
            break
        d = (1 + rate) ** y
        usable = max(0.0, 1.0 - t.fade * (y - 0.5))
        mwh = c * duration * usable * frac / 1000.0          # MWh delivered per kW, that year
        pv_mwh += mwh / d
        pv_cost += (t.fom * frac + charge_price * mwh / t.rte) / d
    return pv_cost / pv_mwh


def winner(duration, techs=None, **kw):
    techs = techs or TECHS
    return min(techs.values(), key=lambda t: lcos(t, duration, **kw))


def crossover(a, b, lo=0.5, hi=2000.0, **kw):
    """Duration (h) above which `b` is cheaper than `a`, by bisection; None if the order does not flip in [lo, hi]."""
    f = lambda d: lcos(a, d, **kw) - lcos(b, d, **kw)
    if f(lo) * f(hi) > 0:
        return None
    for _ in range(80):
        mid = (lo * hi) ** 0.5
        if f(lo) * f(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return (lo * hi) ** 0.5
