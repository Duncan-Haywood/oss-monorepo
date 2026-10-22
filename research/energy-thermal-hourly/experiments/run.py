"""Write experiments/results.txt: a sand store charging in the cheap hours of a modelled German hourly price series.

    PYTHONPATH=src:../energy-thermal-cost/src:../energy-thermal/src python experiments/run.py   # about a minute

Costs: ../energy-thermal-cost (PyPSA technology-data). Hours: OPSD/ENTSO-E Germany 2015-2019 (../energy-mix-years).
Wind and solar fleets: the cost-optimal capacities at each emissions cap from ../energy-mix-sourced/experiments/results.json.
Not from a source (swept): the heat pump's seasonal price weighting, the per-kWh adder, charging a quarter of each cycle.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE.parents[1] / "energy-thermal-cost" / "src"),
                str(HERE.parents[1] / "energy-thermal" / "src")]
from energy_thermal_cost import load, store_lcoh, hp_lcoh  # noqa: E402
from energy_thermal_hourly import (load_year, residual_price_series, gas_marginal_cost, cheapest_mean,  # noqa: E402
                                   heating_season_mean)

OUT = HERE / "results.txt"
SCALES = {"house": 1.0e4, "district": 5.0e6}
CASES = [(1, 300, 365, "daily"), (7, 52, 52, "weekly"), (30, 12, 12, "monthly"), (120, 1, 1, "seasonal")]
res = json.load(open(HERE.parents[1] / "energy-mix-sourced" / "experiments" / "results.json"))
FLEETS = {}
for r in res:
    if r[1].startswith("head_2030_tank_cap"):
        FLEETS[float(r[1].split("cap")[1])] = (r[3]["solar_gw"], r[3]["wind_gw"])
td = load("head_2030")
MC = gas_marginal_cost()
lines = []


def out(s=""):
    lines.append(s)


def compare(prices, rows, scale, case, adder=0.0, hp_months=(11, 12, 1, 2, 3), frac=0.25):
    s, n, w, name = case
    p_store = cheapest_mean(prices, w, frac) + adder
    p_hp = heating_season_mean(prices, rows, hp_months) + adder
    r = store_lcoh(td, "sand", scale, SCALES[scale], n, s, p_store, charge_frac=frac)
    hc, he = hp_lcoh(td, scale, SCALES[scale], p_hp)
    return p_store, p_hp, r["total"], hc + he


out("A. Modelled price. Gas marginal cost %.1f EUR/MWh (fuel 28.4158/0.58 + VOM 5.6104; technology-data head_2030). Price = that when load > solar + wind, else 0." % MC)
out("Fleets (solar GW, wind GW) are the cost-optimal ones of energy-mix-sourced at each CO2 cap (share of the uncapped emissions).")
out("%-8s %6s %6s %6s %10s %12s %12s" % ("cap", "solarGW", "windGW", "year", "mean_eur/kwh", "surplus_h", "heating_mean"))
PRICES = {}
for cap, (sg, wg) in sorted(FLEETS.items(), reverse=True):
    for y in (2015, 2016, 2017, 2018, 2019):
        rows = load_year(y)
        p = residual_price_series(rows, sg, wg, MC)
        PRICES[(cap, y)] = (p, rows)
        out("%-8.2f %6.0f %6.0f %6d %10.4f %12d %12.4f" % (cap, sg, wg, y, sum(p) / len(p), sum(1 for x in p if x == 0),
                                                           heating_season_mean(p, rows)))
out()

out("B. Levelised cost of heat, sand store vs heat pump (EUR/kWh), 2019 hours. store_p = mean price paid charging in the cheapest quarter of each cycle;")
out("hp_p = mean price over Nov-Mar hours. diff = store - hp (negative: store wins). No adder.")
out("%-5s %-9s %-9s %7s %7s %8s %8s %8s" % ("cap", "scale", "case", "store_p", "hp_p", "store", "hp", "diff"))
for cap in sorted(FLEETS, reverse=True):
    p, rows = PRICES[(cap, 2019)]
    for scale in SCALES:
        for case in CASES:
            sp, hpp, st, hp = compare(p, rows, scale, case)
            out("%-5.2f %-9s %-9s %7.4f %7.4f %8.3f %8.3f %+8.3f" % (cap, scale, case[3], sp, hpp, st, hp, st - hp))
out()

out("C. Does the store win? Count of the 5 weather years (2015-2019) in which store < heat pump, by fleet, scale and cycle; no adder, and with a levy of 0.10 EUR/kWh on both.")
out("%-5s %-9s %-9s %8s %8s" % ("cap", "scale", "case", "wins", "wins@0.10"))
for cap in sorted(FLEETS, reverse=True):
    for scale in SCALES:
        for case in CASES:
            w0 = w1 = 0
            for y in (2015, 2016, 2017, 2018, 2019):
                p, rows = PRICES[(cap, y)]
                a = compare(p, rows, scale, case)
                b = compare(p, rows, scale, case, adder=0.10)
                w0 += a[2] < a[3]
                w1 += b[2] < b[3]
            out("%-5.2f %-9s %-9s %5d/5 %5d/5" % (cap, scale, case[3], w0, w1))
out()

out("D. Sensitivity (house, daily and weekly, fleet cap 0.2, 2019): adder, charge window, gas price (CO2 price on the fuel), heat pump on annual mean.")
out("%-34s %-8s %7s %7s %8s %8s %8s" % ("change", "case", "store_p", "hp_p", "store", "hp", "diff"))
p, rows = PRICES[(0.2, 2019)]
for label, kw in (("base", {}), ("adder 0.05", {"adder": 0.05}), ("adder 0.10", {"adder": 0.10}), ("adder 0.20", {"adder": 0.20}),
                  ("charge in 1/8 of cycle", {"frac": 0.125}), ("charge in 1/2 of cycle", {"frac": 0.5}),
                  ("hp on all-year mean", {"hp_months": tuple(range(1, 13))}), ("hp Dec-Feb only", {"hp_months": (12, 1, 2)})):
    for case in CASES[:2]:
        sp, hpp, st, hp = compare(p, rows, "house", case, **kw)
        out("%-34s %-8s %7.4f %7.4f %8.3f %8.3f %+8.3f" % (label, case[3], sp, hpp, st, hp, st - hp))
for co2 in (0, 50, 100, 200):
    mc = gas_marginal_cost(co2_price=co2)
    pp = residual_price_series(rows, *FLEETS[0.2], mc)
    for case in CASES[:2]:
        sp, hpp, st, hp = compare(pp, rows, "house", case)
        out("%-34s %-8s %7.4f %7.4f %8.3f %8.3f %+8.3f" % ("CO2 price %d EUR/t (gas %.0f EUR/MWh)" % (co2, mc), case[3], sp, hpp, st, hp, st - hp))
out()
out("E. Surplus-hour price floor (EUR/MWh paid when renewables exceed load; 0 in the base), house, fleet cap 0.2, 2019. Real markets have floors from support schemes and must-run plant.")
out("%-12s %-8s %7s %7s %8s %8s %8s" % ("floor", "case", "store_p", "hp_p", "store", "hp", "diff"))
for fl in (0, 10, 20, 30, 40):
    pp = residual_price_series(rows, *FLEETS[0.2], MC, floor=fl)
    for case in CASES[:2]:
        sp, hpp, st, hp = compare(pp, rows, "house", case)
        out("%-12d %-8s %7.4f %7.4f %8.3f %8.3f %+8.3f" % (fl, case[3], sp, hpp, st, hp, st - hp))
OUT.write_text("\n".join(lines) + "\n")
print("\n".join(lines))
