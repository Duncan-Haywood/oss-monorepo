"""Hourly electricity price from real German load, solar and wind, and what a store pays by charging in the cheap hours.

Price model (merit order with one dispatchable fuel, no storage, no grid): in an hour where load exceeds
solar + wind, gas sets the price at its marginal cost (fuel / efficiency + variable O&M); otherwise surplus
renewables set it at `floor` (0). This is a modelled price, not a market one; see the README.
"""
import csv
from pathlib import Path

HERE = Path(__file__).resolve()
YEARS_DIR = HERE.parents[3] / "energy-mix-years" / "data"
PARAMS = HERE.parents[3] / "energy-mix-sourced" / "data" / "params.csv"


def load_year(year):
    """Rows (month, load_mw, solar_cf, wind_cf) of 8,760 hours (OPSD / ENTSO-E, CC BY 4.0)."""
    rows = []
    with open(YEARS_DIR / f"de{year}.csv") as f:
        for r in csv.DictReader(f):
            rows.append((int(r["utc"][5:7]), float(r["load_mw"]), float(r["solar_cf"]), float(r["wind_cf"])))
    return rows


def gas_marginal_cost(basis="head_2030", co2_price=0.0):
    """EUR/MWh_e of a CCGT: fuel / eta + VOM (+ CO2 intensity / eta * price), all from the technology-data table."""
    v = {}
    with open(PARAMS) as f:
        for r in csv.DictReader(f):
            if r["basis"] == basis and r["technology"] in ("gas", "CCGT"):
                v[(r["technology"], r["parameter"])] = float(r["value"])
    eta = v[("CCGT", "efficiency")]
    return (v[("gas", "fuel")] + co2_price * v[("gas", "CO2 intensity")]) / eta + v[("CCGT", "VOM")]


def residual_price_series(rows, solar_gw, wind_gw, mc, floor=0.0):
    """EUR/kWh per hour: `mc` EUR/MWh when load > solar + wind, else `floor` EUR/MWh."""
    out = []
    for _, load_mw, s, w in rows:
        res = load_mw - 1e3 * (solar_gw * s + wind_gw * w)
        out.append((mc if res > 0 else floor) / 1000.0)
    return out


def cheapest_mean(prices, windows, frac):
    """Mean price paid by a charger that buys the cheapest `frac` of the hours in each of `windows` equal windows."""
    n = len(prices)
    size = n // windows
    total = 0.0
    k = max(1, round(size * frac))
    for i in range(windows):
        seg = sorted(prices[i * size:(i + 1) * size])
        total += sum(seg[:k]) / k
    return total / windows


def heating_season_mean(prices, rows, months=(11, 12, 1, 2, 3)):
    """Mean price over the heating-season months (a flat heat demand within them)."""
    sel = [p for p, r in zip(prices, rows) if r[0] in months]
    return sum(sel) / len(sel)
