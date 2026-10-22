"""Write experiments/results.txt: a sand store vs a heat pump on real German day-ahead prices, 2015-2019.

    PYTHONPATH=src:../energy-thermal-hourly/src:../energy-thermal-cost/src:../energy-thermal/src python experiments/run.py

Costs: ../energy-thermal-cost (PyPSA technology-data). Prices: data/price<year>.csv (OPSD / ENTSO-E, CC BY 4.0).
Modelled price for comparison: ../energy-thermal-hourly with each year's actual installed solar and onshore wind.
Not from a source (swept): charging a quarter of each cycle, flat Nov-Mar heat demand, the per-kWh levy.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for d in ("src",):
    sys.path.insert(0, str(HERE.parent / d))
for p in ("energy-thermal-hourly", "energy-thermal-cost", "energy-thermal"):
    sys.path.insert(0, str(HERE.parents[1] / p / "src"))
from energy_thermal_cost import load, store_lcoh, hp_lcoh  # noqa: E402
from energy_thermal_hourly import (load_year, residual_price_series, gas_marginal_cost, cheapest_mean,  # noqa: E402
                                   heating_season_mean)
from energy_thermal_real import load_prices, load_capacity, pearson, negative_hours  # noqa: E402

YEARS = (2015, 2016, 2017, 2018, 2019)
SCALES = {"house": 1.0e4, "district": 5.0e6}
CASES = [(1, 300, 365, "daily"), (7, 52, 52, "weekly"), (30, 12, 12, "monthly"), (120, 1, 1, "seasonal")]
td = load("head_2030")
MC = gas_marginal_cost()
lines = []


def out(s=""):
    lines.append(s)


def costs(prices, rows, scale, case, adder=0.0, hp_months=(11, 12, 1, 2, 3), frac=0.25, p_store=None):
    s, n, w, name = case
    ps = (cheapest_mean(prices, w, frac) if p_store is None else p_store) + adder
    ph = heating_season_mean(prices, rows, hp_months) + adder
    r = store_lcoh(td, "sand", scale, SCALES[scale], n, s, ps, charge_frac=frac)
    hc, he = hp_lcoh(td, scale, SCALES[scale], ph)
    return ps, ph, r["total"], hc + he


DATA = {}
for y in YEARS:
    rows = load_year(y)
    real = load_prices(y)
    sg, wg = load_capacity(y)
    model = residual_price_series(rows, sg, wg, MC)
    DATA[y] = (rows, real, model, sg, wg)

out("A. Real day-ahead price (EUR/kWh) and the cheap hours a store can use. Zone: DE-AT-LU to 30 Sep 2018, DE-LU after (OPSD, ENTSO-E).")
out("%-5s %8s %8s %8s %8s %8s %8s %8s %8s" % ("year", "mean", "heat_mean", "neg_h", "q_daily", "q_weekly", "q_month", "q_season", "min_eur/MWh"))
for y in YEARS:
    rows, real = DATA[y][:2]
    out("%-5d %8.4f %8.4f %8d %8.4f %8.4f %8.4f %8.4f %8.1f" % (
        y, sum(real) / len(real), heating_season_mean(real, rows), negative_hours(real),
        cheapest_mean(real, 365, .25), cheapest_mean(real, 52, .25), cheapest_mean(real, 12, .25),
        cheapest_mean(real, 1, .25), min(real) * 1000))
out()

out("B. Does the one-fuel merit-order model of energy-thermal-hourly reproduce the real price? Model uses the year's installed solar and onshore wind (GW, OPSD) and gas at %.1f EUR/MWh." % MC)
out("%-5s %6s %6s %9s %9s %9s %9s %7s" % ("year", "solGW", "windGW", "real_mean", "model_mean", "real_q_day", "model_q_day", "corr"))
for y in YEARS:
    rows, real, model, sg, wg = DATA[y]
    out("%-5d %6.1f %6.1f %9.4f %9.4f %9.4f %9.4f %7.3f" % (
        y, sg, wg, sum(real) / len(real), sum(model) / len(model), cheapest_mean(real, 365, .25),
        cheapest_mean(model, 365, .25), pearson(real, model)))
out()

out("C. Levelised cost of heat (EUR/kWh) on real prices. diff = store - heat pump (negative: the store wins). 'bepr' = break-even store price (EUR/kWh) at which diff = 0.")
out("%-9s %-9s %-5s %7s %7s %8s %8s %8s %8s" % ("scale", "case", "year", "store_p", "hp_p", "store", "hp", "diff", "bepr"))
wins = {}
for scale in SCALES:
    for case in CASES:
        for y in YEARS:
            rows, real = DATA[y][:2]
            sp, hpp, st, hp = costs(real, rows, scale, case)
            c0 = costs(real, rows, scale, case, p_store=0.0)[2]   # the store's cost is linear in its price
            c1 = costs(real, rows, scale, case, p_store=0.1)[2]
            be = (hp - c0) / ((c1 - c0) / 0.1)
            wins[(scale, case[3], y)] = st < hp
            out("%-9s %-9s %-5d %7.4f %7.4f %8.3f %8.3f %+8.3f %8.4f" % (scale, case[3], y, sp, hpp, st, hp, st - hp, be))
out()
out("D. Years (of 5) in which the store beats the heat pump on real prices, with no levy and with a levy of 0.10 EUR/kWh on both prices.")
out("%-9s %-9s %6s %9s" % ("scale", "case", "wins", "wins@0.10"))
for scale in SCALES:
    for case in CASES:
        lv = [costs(DATA[y][1], DATA[y][0], scale, case, adder=0.10) for y in YEARS]
        w1 = sum(c[2] < c[3] for c in lv)
        out("%-9s %-9s %4d/5 %7d/5" % (scale, case[3], sum(wins[(scale, case[3], y)] for y in YEARS), w1))
out()

out("E. Sensitivity (house, daily and weekly, 2019 real prices): charge window and heat pump weighting.")
out("%-28s %-8s %7s %7s %8s %8s %8s" % ("change", "case", "store_p", "hp_p", "store", "hp", "diff"))
rows, real = DATA[2019][:2]
for label, kw in (("base", {}), ("charge in 1/8 of cycle", {"frac": 0.125}), ("charge in 1/2 of cycle", {"frac": 0.5}),
                  ("hp on all-year mean", {"hp_months": tuple(range(1, 13))}), ("hp Dec-Feb only", {"hp_months": (12, 1, 2)})):
    for case in CASES[:2]:
        sp, hpp, st, hp = costs(real, rows, "house", case, **kw)
        out("%-28s %-8s %7.4f %7.4f %8.3f %8.3f %+8.3f" % (label, case[3], sp, hpp, st, hp, st - hp))
OUT = HERE / "results.txt"
OUT.write_text("\n".join(lines) + "\n")
print("\n".join(lines))
