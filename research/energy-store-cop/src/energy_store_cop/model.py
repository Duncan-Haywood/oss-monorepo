"""Store-minus-heat-pump cost of heat when the heat pump's COP follows the weather, on real German prices and temperatures.

energy-store-flip and energy-thermal-real charge the heat pump a flat heating-season price divided by one table COP (3.6).
Here the pump's electricity cost is the heat-weighted mean of price / COP(T) over the hours of the year, with the heat
demand proportional to heating degrees below a base temperature. Everything else is imported unchanged. Stdlib only.
"""
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "energy-store-flip" / "src"))
from energy_store_flip.model import (YEARS, SCALES, CASES, TD, prices, scaled, store_lcoh, hp_lcoh, cheapest_mean)  # noqa: E402,F401

DATA = Path(__file__).resolve().parents[2] / "data"


def load_temp(year):
    """Population-weighted 2 m air temperature (deg C) of five German cities for each of the year's 8,760 hours (ERA5)."""
    with open(DATA / f"temp{year}.csv") as f:
        return [float(r["temp_c"]) for r in csv.DictReader(f)]


def cop_ashp(t_source, t_sink):
    """Air-source heat-pump COP from the temperature lift (Staffell et al. 2012 fit, as used by when2heat / PyPSA-Eur):
    6.81 - 0.121 dT + 0.000630 dT^2, dT = t_sink - t_source (deg C). The fit is for dT of about 15 to 60 K; the lift is
    floored at 15 K and the COP at 1 outside it (a pump does not do worse than a resistive element)."""
    dt = max(15.0, t_sink - t_source)
    return max(1.0, 6.81 - 0.121 * dt + 0.000630 * dt * dt)


def heat_weights(temps, t_base=15.0):
    """Heat demand per hour, proportional to the heating degrees max(0, t_base - T)."""
    return [max(0.0, t_base - t) for t in temps]


def hp_energy_price(year, t_sink=45.0, t_base=15.0, weighted=True):
    """Heat pump electricity cost per kWh of heat, EUR/kWh: sum(w p / COP) / sum(w).

    weighted=False uses a flat weight over November to March (the earlier model's season) but still the hourly COP."""
    series, _ = prices(year)
    temps = load_temp(year)
    if weighted:
        w = heat_weights(temps, t_base)
    else:
        months = [r[0] for r in _months(year)]
        w = [1.0 if m in (11, 12, 1, 2, 3) else 0.0 for m in months]
    return sum(wi * p / cop_ashp(t, t_sink) for wi, p, t in zip(w, series, temps)) / sum(w)


def _months(year):
    from energy_thermal_hourly import load_year
    return load_year(year)


def seasonal_cop(year, t_sink=45.0, t_base=15.0):
    """Heat-weighted seasonal COP: total heat / total electricity at the unweighted-by-price level."""
    temps = load_temp(year)
    w = heat_weights(temps, t_base)
    return sum(w) / sum(wi / cop_ashp(t, t_sink) for wi, t in zip(w, temps))


def diff(year, scale, case, m_store=1.0, m_hp=1.0, frac=0.25, mode="table", t_sink=45.0, t_base=15.0):
    """Store minus heat pump, EUR/kWh of heat. mode: 'table' (flat season mean price / 3.6), 'cop_flat' (hourly COP, flat
    November-March weights), 'cop_hdd' (hourly COP, heating-degree weights). Negative: the store wins."""
    series, hp_p = prices(year)
    td = scaled(m_store, m_hp)
    s, n, w, _ = case
    r = store_lcoh(td, "sand", scale, SCALES[scale], n, s, cheapest_mean(series, w, frac), charge_frac=frac)
    if mode == "table":
        hc, he = hp_lcoh(td, scale, SCALES[scale], hp_p)
    else:
        hc, _ = hp_lcoh(td, scale, SCALES[scale], 0.0)
        he = hp_energy_price(year, t_sink, t_base, weighted=(mode == "cop_hdd"))
    return r["total"] - (hc + he)


def flip_multiplier(year, scale, case, lo=0.05, hi=20.0, **kw):
    """Store-capex multiplier at which the diff is zero (None if no sign change on [lo, hi])."""
    f = lambda m: diff(year, scale, case, m_store=m, **kw)  # noqa: E731
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
