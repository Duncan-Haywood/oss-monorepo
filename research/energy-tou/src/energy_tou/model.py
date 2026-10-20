"""Time-of-use pricing for the `energy-home` hourly home model (stdlib only).

Prices are ASSUMED round numbers, not a utility's tariff. Dispatch is hour-by-hour with a fixed rule, no forecast.
"""
import os
import sys

_SIB = os.path.join(os.path.dirname(__file__), "..", "..", "..", "energy-home", "src")
if _SIB not in sys.path:
    sys.path.append(_SIB)

import math  # noqa: E402
from dataclasses import dataclass  # noqa: E402
from energy_home import Home, capital_recovery  # noqa: E402


@dataclass(frozen=True)
class Tou:
    """Import price by hour of day ($/kWh, 24 values) and a flat export price."""
    prices: tuple
    export: float = 0.05

    def peak_hours(self):
        top = max(self.prices)
        return frozenset(h for h, p in enumerate(self.prices) if p >= top - 1e-12)

    def mean_price(self, load):
        """Load-weighted mean import price over an hourly load list (starts at hour 0)."""
        return sum(self.prices[i % 24] * l for i, l in enumerate(load)) / sum(load)


# flat $0.30 against an assumed three-band tariff: off-peak 21:00-07:00, shoulder, peak 16:00-21:00
FLAT = Tou((0.30,) * 24)
TOU = Tou(tuple(0.15 if (h >= 21 or h < 7) else 0.45 if 16 <= h < 21 else 0.28 for h in range(24)))


def simulate_tou(home, ghi, load, tou, policy="greedy", grid_charge=0.0):
    """One year, 1 h steps. Returns kWh totals plus `cost`: import cost less export revenue ($).

    policy "greedy": discharge whenever the load needs it (as `energy-home`).
    policy "peak":   discharge only in the tariff's top-price hours; PV surplus always charges.
    grid_charge: share of usable capacity to fill from the grid in the off-peak band before it is needed
                 (only with policy "peak"; 0 means PV-only charging). Charged during the lowest-price hours.
    """
    cap = home.batt_kwh * home.usable
    pmax = home.batt_kwh * home.c_rate
    eta = math.sqrt(home.rt_eff)
    peak = tou.peak_hours()
    low = min(tou.prices)
    soc = 0.0
    t = dict(load=0.0, pv=0.0, imp=0.0, exp=0.0, grid_in=0.0, cost=0.0)
    for i, (g, l) in enumerate(zip(ghi, load)):
        h = i % 24
        price = tou.prices[h]
        pv = home.pv_kw * home.perf_ratio * g / 1000.0
        direct = min(pv, l)
        surplus, need = pv - direct, l - direct
        c = min(surplus, pmax, (cap - soc) / eta) if cap > 0 else 0.0
        soc += c * eta
        imp_extra = 0.0
        if cap > 0 and policy == "peak" and grid_charge > 0 and price <= low + 1e-12:
            room = min(pmax - c, (grid_charge * cap - soc) / eta)
            if room > 0:
                soc += room * eta
                imp_extra = room
        if cap > 0 and (policy == "greedy" or h in peak):
            d = min(need, pmax, soc * eta)
        else:
            d = 0.0
        soc -= d / eta
        imp = need - d + imp_extra
        t["load"] += l
        t["pv"] += pv
        t["imp"] += imp
        t["grid_in"] += imp_extra
        t["exp"] += surplus - c
        t["cost"] += imp * price - (surplus - c) * tou.export
    return t


def bill(home, ghi, load, tou, policy="greedy", grid_charge=0.0):
    """Annual energy bill ($) with the home's battery."""
    return simulate_tou(home, ghi, load, tou, policy, grid_charge)["cost"]


def breakeven_price(home, ghi, load, tou, policy="greedy", grid_charge=0.0, rate=0.06, life=15):
    """Installed $/kWh at which the battery's bill saving over the same home without one just pays for it."""
    nob = Home(home.pv_kw, home.perf_ratio, 0.0, home.usable, home.rt_eff, home.c_rate)
    saving = bill(nob, ghi, load, tou) - bill(home, ghi, load, tou, policy, grid_charge)
    return saving / (home.batt_kwh * capital_recovery(rate, life))
