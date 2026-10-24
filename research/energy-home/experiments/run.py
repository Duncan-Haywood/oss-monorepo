"""Experiments for energy-home. Deterministic; writes results.txt.   PYTHONPATH=src python experiments/run.py"""
import statistics
from pathlib import Path
from energy_home import Home, Tariff, Costs, year_weather, year_load, simulate, annual_cost, breakeven_battery_price

HERE = Path(__file__).resolve().parent
SEEDS = range(20)
WX = {s: year_weather(s) for s in SEEDS}
LD = {s: year_load(8000, s) for s in SEEDS}
COSTS, TAR = Costs(), Tariff()
out = []


def p(s=""):
    out.append(s)


def mean_sim(home, key):
    return statistics.mean(simulate(home, WX[s], LD[s])[key] for s in SEEDS)


def mean_cost(home, tariff, costs=COSTS):
    return statistics.mean(annual_cost(home, simulate(home, WX[s], LD[s]), tariff, costs) for s in SEEDS)


p("Assumed inputs: 8,000 kWh/yr load, 40N, PV perf ratio 0.80, battery 90% usable, 90% round trip, C/2; import $0.30,")
p("export $0.05, PV $2,800/kW 25 y, battery $800/kWh 15 y, 6% discount. Mean over 20 weather seeds.")
p()
p("A. PV only: size vs self-sufficiency and self-consumption")
p("pv_kw yield_kwh self_suff self_cons")
for k in (1, 2, 3, 4, 6, 8, 10, 12):
    h = Home(float(k))
    p(f"{k} {mean_sim(h, 'pv'):.0f} {mean_sim(h, 'self_sufficiency'):.3f} {mean_sim(h, 'self_consumption'):.3f}")
p()
p("B. 6 kW PV: battery size vs self-sufficiency (marginal kWh of imports avoided per nameplate kWh)")
p("batt_kwh self_suff self_cons import_kwh marginal")
prev = None
for b in (0, 2.5, 5, 10, 15, 20, 30, 40):
    h = Home(6.0, batt_kwh=float(b))
    imp = mean_sim(h, "imp")
    marg = "-" if prev is None else f"{(prev[1] - imp) / (b - prev[0]):.0f}"
    p(f"{b} {mean_sim(h, 'self_sufficiency'):.3f} {mean_sim(h, 'self_consumption'):.3f} {imp:.0f} {marg}")
    prev = (b, imp)
p()
p("C. Cheapest sizing (annualised $, grid search PV 0-12 kW x battery 0-30 kWh) by export price")
p("export_price pv_kw batt_kwh annual_cost grid_only_cost saving")
grid_only = mean_cost(Home(0.0), TAR)
for ex in (0.00, 0.05, 0.10, 0.20, 0.30):
    tar = Tariff(0.30, ex)
    best = min(((mean_cost(Home(float(k), batt_kwh=float(b)), tar), k, b)
                for k in (0, 2, 3, 4, 5, 6, 8, 10, 12) for b in (0, 5, 10, 15, 20, 30)))
    p(f"{ex:.2f} {best[1]} {best[2]} {best[0]:.0f} {grid_only:.0f} {grid_only - best[0]:.0f}")
p()
p("D. Break-even installed battery price ($/kWh nameplate, 15 y, 6%) for a 10 kWh battery at 6 kW PV")
p("export_price breakeven_price_per_kwh vs_assumed_800")
for ex in (0.00, 0.05, 0.10, 0.20, 0.30):
    tar = Tariff(0.30, ex)
    be = statistics.mean(breakeven_battery_price(Home(6.0, batt_kwh=10.0), WX[s], LD[s], tar, COSTS) for s in SEEDS)
    p(f"{ex:.2f} {be:.0f} {'pays' if be >= 800 else 'does not pay'}")
p()
p("E. Weather-seed spread, 6 kW PV, 10 kWh battery (20 seeds)")
p("metric mean min max")
for key in ("pv", "self_sufficiency", "imp", "exp"):
    v = [simulate(Home(6.0, batt_kwh=10.0), WX[s], LD[s])[key] for s in SEEDS]
    p(f"{key} {statistics.mean(v):.3f} {min(v):.3f} {max(v):.3f}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
