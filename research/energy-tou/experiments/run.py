"""Experiments for energy-tou. Deterministic; writes results.txt.   PYTHONPATH=src python experiments/run.py"""
import statistics
from pathlib import Path
import sys
sys.path.append(str(Path(__file__).resolve().parents[2] / "energy-home" / "src"))
from energy_home import Home, year_weather, year_load
from energy_tou import FLAT, TOU, breakeven_price, bill

HERE = Path(__file__).resolve().parent
SEEDS = range(10)
WX = {s: year_weather(s) for s in SEEDS}
LD = {s: year_load(8000, s) for s in SEEDS}
out = []


def p(s=""):
    out.append(s)


def mean(f):
    return statistics.mean(f(WX[s], LD[s]) for s in SEEDS)


p("Assumed inputs: 8,000 kWh/yr load, 40N, 6% discount, battery 15 y, 90% round trip, C/2, export $0.05.")
p("TOU tariff (assumed): $0.15 off-peak 21-07h, $0.28 shoulder, $0.45 peak 16-21h. Flat: $0.30. Mean of 10 weather seeds.")
p(f"Load-weighted mean import price: flat 0.300, TOU {statistics.mean(TOU.mean_price(LD[s]) for s in SEEDS):.3f}")
p()
p("A. Break-even installed battery price ($/kWh), 6 kW PV, 10 kWh, by tariff and dispatch")
p("tariff policy grid_charge breakeven vs_800")
for name, tou, pol, gc in (("flat", FLAT, "greedy", 0.0), ("tou", TOU, "greedy", 0.0), ("tou", TOU, "peak", 0.0),
                           ("tou", TOU, "peak", 0.5), ("tou", TOU, "peak", 1.0)):
    be = mean(lambda w, l: breakeven_price(Home(6.0, batt_kwh=10.0), w, l, tou, pol, gc))
    p(f"{name} {pol} {gc} {be:.0f} {'pays' if be >= 800 else 'does not pay'}")
p()
p("B. Break-even ($/kWh) by battery size, TOU tariff, peak dispatch with full off-peak grid charge, 6 kW PV")
p("batt_kwh breakeven flat_greedy_breakeven")
for b in (2.5, 5, 10, 15, 20):
    h = Home(6.0, batt_kwh=float(b))
    be = mean(lambda w, l: breakeven_price(h, w, l, TOU, "peak", 1.0))
    fl = mean(lambda w, l: breakeven_price(h, w, l, FLAT))
    p(f"{b} {be:.0f} {fl:.0f}")
p()
p("C. Break-even ($/kWh), 10 kWh, peak dispatch with full grid charge, by PV size (0 = battery for arbitrage alone)")
p("pv_kw tou_breakeven flat_breakeven")
for k in (0, 2, 4, 6, 8):
    h = Home(float(k), batt_kwh=10.0)
    be = mean(lambda w, l: breakeven_price(h, w, l, TOU, "peak", 1.0))
    fl = mean(lambda w, l: breakeven_price(h, w, l, FLAT))
    p(f"{k} {be:.0f} {fl:.0f}")
p()
p("D. Peak-to-off-peak price spread needed: peak price swept, off-peak $0.15, shoulder $0.28; 6 kW PV, 10 kWh, peak dispatch + full grid charge")
p("peak_price breakeven")
from energy_tou import Tou
for pk in (0.28, 0.35, 0.45, 0.55, 0.70):
    t = Tou(tuple(0.15 if (h >= 21 or h < 7) else pk if 16 <= h < 21 else 0.28 for h in range(24)))
    be = mean(lambda w, l: breakeven_price(Home(6.0, batt_kwh=10.0), w, l, t, "peak", 1.0))
    p(f"{pk:.2f} {be:.0f}")
p()
p("E. Annual bill ($) for 6 kW PV, 10 kWh vs 6 kW PV alone, TOU, peak dispatch + grid charge")
nb = mean(lambda w, l: bill(Home(6.0), w, l, TOU))
wb = mean(lambda w, l: bill(Home(6.0, batt_kwh=10.0), w, l, TOU, "peak", 1.0))
p(f"no_battery {nb:.0f}  battery {wb:.0f}  saving {nb - wb:.0f}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
