"""Does a discharge-side heat exchanger flip the sand-store vs heat-pump verdict? Stdlib only.

energy-store-cop leaves the store's heat exchanger out. No sourced price for a sand-to-water exchanger exists in the
cost table, so the exchanger's specific cost (EUR per kW of peak discharge power) is the swept variable and the
result is the break-even price at which the verdict flips. Everything else is energy-store-cop unchanged.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "energy-store-cop" / "src"))
from energy_store_cop.model import (YEARS, SCALES, CASES, TD, diff)  # noqa: E402
from energy_thermal_cost.cost import annuity  # noqa: E402

# Lifetime and fixed O&M of the exchanger are borrowed from the table's sand charger (35 y, 1.075 %/y; the committed
# params.csv has no discharger rows): disclosed, not measured for a plate exchanger.
SD = dict(TD["Sand-charger"])
# Upper anchor only: PyPSA technology-data master, costs_2030.csv, "Sand-discharger" investment, 725,191.7 EUR/MW
# (2025 EUR; Georgiou 2018 power equipment). It is a heat-to-electricity block, not a heat exchanger. Fetched 2026-10-23.
SAND_DISCHARGER_EUR_PER_KW = 725.19


def hx_cost(c_kw, scale="house", flh=2000.0, rate=0.04):
    """Annualised exchanger cost per kWh of heat, EUR/kWh: peak = annual heat / flh (the pump's own sizing rule)."""
    annual = SCALES[scale]
    kw = annual / flh
    return c_kw * kw * (annuity(rate, SD["lifetime"]) + SD["FOM"] / 100.0) / annual


def diff_hx(year, scale, case, c_kw, flh=2000.0, **kw):
    """Store (with exchanger) minus pump, EUR/kWh of heat; negative: the store wins."""
    return diff(year, scale, case, **kw) + hx_cost(c_kw, scale, flh)


def breakeven_hx(year, scale, case, flh=2000.0, **kw):
    """Exchanger price, EUR per kW of peak discharge, at which the diff is zero (negative: the store loses even free)."""
    d = diff(year, scale, case, **kw)
    unit = hx_cost(1.0, scale, flh)
    return -d / unit


def flip_multiplier_hx(year, scale, case, c_kw, flh=2000.0, lo=0.05, hi=20.0, **kw):
    """Store-capex multiplier at which the diff (with an exchanger at c_kw) is zero; None if no sign change on [lo, hi]."""
    f = lambda m: diff_hx(year, scale, case, c_kw, flh, m_store=m, **kw)  # noqa: E731
    a, b = f(lo), f(hi)
    if a * b > 0:
        return None
    for _ in range(50):
        mid = (lo * hi) ** 0.5
        if f(mid) * a > 0:
            lo = mid
        else:
            hi = mid
    return (lo * hi) ** 0.5
