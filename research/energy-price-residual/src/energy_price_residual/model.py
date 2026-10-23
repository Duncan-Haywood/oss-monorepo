"""Residual-load price model: price as a non-decreasing function of load minus solar minus onshore wind.

Data are the committed files of energy-mix-years (hourly load, capacity factors) and energy-thermal-real
(day-ahead price, installed capacity). Stdlib only.
"""
import csv
from bisect import bisect_right
from pathlib import Path

from energy_thermal_real import load_prices, load_capacity

YEARS = (2015, 2016, 2017, 2018, 2019)
MIX = Path(__file__).resolve().parents[3] / "energy-mix-years" / "data"


def residual_load(load_mw, solar_cf, wind_cf, solar_gw, wind_gw):
    """MW of demand left for dispatchable plant: load minus solar minus onshore wind."""
    return load_mw - solar_cf * solar_gw * 1000.0 - wind_cf * wind_gw * 1000.0


def load_year_rows(year):
    """(residual load MW, price EUR/MWh, hour of day UTC) for each of the year's 8,760 hours."""
    sol, wnd = load_capacity(year)
    price = load_prices(year)
    with open(MIX / f"de{year}.csv") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == len(price)
    out = []
    for r, p in zip(rows, price):
        out.append((residual_load(float(r["load_mw"]), float(r["solar_cf"]), float(r["wind_cf"]), sol, wnd),
                    p * 1000.0, int(r["utc"][11:13])))
    return out


def isotonic_fit(x, y):
    """Pool-adjacent-violators: non-decreasing step function minimising squared error.
    Returns (breakpoints, levels): level i applies from breakpoints[i] up to breakpoints[i+1]."""
    pts = sorted(zip(x, y))
    blocks = []  # [sum, count, lowest x]
    for xv, yv in pts:
        blocks.append([yv, 1, xv])
        while len(blocks) > 1 and blocks[-2][0] / blocks[-2][1] > blocks[-1][0] / blocks[-1][1]:
            s, c, _ = blocks.pop()
            blocks[-1][0] += s
            blocks[-1][1] += c
    return [b[2] for b in blocks], [b[0] / b[1] for b in blocks]


def predict(fit, x):
    bp, lv = fit
    i = bisect_right(bp, x) - 1
    return lv[max(i, 0)]


def rmse(a, b):
    return (sum((u - v) ** 2 for u, v in zip(a, b)) / len(a)) ** 0.5


def cheapest_quarter_mean(prices):
    s = sorted(prices)
    k = len(s) // 4
    return sum(s[:k]) / k
