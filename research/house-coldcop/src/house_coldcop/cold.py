"""Temperature-dependent heat-pump COP on top of house-hvacnpc's break-even premium.

The degree-day model has no outdoor-temperature distribution, so one is fitted: hourly temperature ~ Normal(mu, sd)
with mu and sd chosen so the expected HDD65 and CDD65 equal the climate's table values. The heat-pump heating COP
curve is linear in temperature, floored at 1 (resistance backup). The load-weighted harmonic-mean COP over the
heating degree-hours replaces the constant 2.5, and the rest is house-hvacnpc unchanged.
"""
import math
from contextlib import contextmanager

import house_energy.model as M
from house_hvacnpc.breakeven import premium

BASE = 65.0


def _phi(z):
    return math.exp(-z * z / 2) / math.sqrt(2 * math.pi)


def _Phi(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def expected_hdd(mu, sd):
    """365 * E[(65 - T)+] for T ~ Normal(mu, sd)."""
    z = (BASE - mu) / sd
    return 365 * ((BASE - mu) * _Phi(z) + sd * _phi(z))


def fit_normal(hdd, cdd):
    """(mu, sd) with expected HDD65 = hdd and CDD65 = cdd. E[(65-T)+] - E[(T-65)+] = 65 - mu, so mu is exact."""
    mu = BASE - (hdd - cdd) / 365
    lo, hi = 0.5, 60.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if expected_hdd(mu, mid) < hdd:
            lo = mid
        else:
            hi = mid
    return mu, (lo + hi) / 2


def cop(t, c47, slope):
    return max(1.0, c47 + slope * (t - 47.0))


def seasonal_cop(climate, c47, slope):
    """Heating-load-weighted harmonic mean COP over a climate's fitted temperature distribution."""
    hdd, cdd = M.CLIMATES[climate]
    mu, sd = fit_normal(hdd, cdd)
    num = den = 0.0
    t = mu - 8 * sd
    while t < BASE:
        w = _Phi((t + 0.5 - mu) / sd) - _Phi((t - 0.5 - mu) / sd)  # share of hours in this 1 F bin
        load = w * (BASE - t)
        num += load
        den += load / cop(t, c47, slope)
        t += 1.0
    return num / den


@contextmanager
def heat_pump_cop(value):
    """Temporarily replace the model's constant heating COP."""
    old = M.SYSTEMS["heat pump"]
    M.SYSTEMS["heat pump"] = {**old, "heat_eff": value}
    try:
        yield
    finally:
        M.SYSTEMS["heat pump"] = old


def premium_with_curve(climate, prices, c47, slope, rate=M.DISCOUNT):
    eta = seasonal_cop(climate, c47, slope)
    with heat_pump_cop(eta):
        return premium(climate, prices, rate)[0], eta
