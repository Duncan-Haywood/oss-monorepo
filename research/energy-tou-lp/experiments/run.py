"""Experiments for energy-tou-lp. Deterministic; writes results.txt.
    PYTHONPATH=src:../energy-tou/src:../energy-home/src python experiments/run.py
"""
import statistics
from pathlib import Path
from energy_home import Home, year_weather, year_load, capital_recovery
from energy_tou import FLAT, TOU, Tou
from energy_tou_lp.model import (lp_dispatch, rolling_dispatch, rule_run, no_battery_bill, year_prices, _net)

HERE = Path(__file__).resolve().parent
SEEDS = range(10)
WX = {s: year_weather(s) for s in SEEDS}
LD = {s: year_load(8000, s) for s in SEEDS}
RATE, LIFE, CYC_LIFE = 0.06, 15, 4000
out = []


def p(s=""):
    out.append(s)


def mean(f):
    return statistics.mean(f(s) for s in SEEDS)


def lp_year(home, tou, s, wear=0.0):
    sur, need = _net(home, WX[s], LD[s])
    r = lp_dispatch(home, sur, need, year_prices(tou, len(need)), tou.export, wear)
    return dict(cost=r["cost"], throughput=float(r["discharge"].sum()))


def be(saving, home, throughput, life_limited=False):
    """Break-even installed $/kWh; with life_limited the battery lasts min(15 y, CYC_LIFE full cycles)."""
    life = LIFE
    if life_limited and throughput > 0:
        life = min(LIFE, CYC_LIFE / (throughput / (home.batt_kwh * home.usable)))
    return saving / (home.batt_kwh * capital_recovery(RATE, life)) if life > 0 else 0.0


def row(home, tou, s, kind, wear=0.0):
    """(break-even ignoring wear, break-even with cycle-limited life, cycles per year) for one weather seed."""
    base = no_battery_bill(home, WX[s], LD[s], tou)
    if kind == "lp":
        r = lp_year(home, tou, s, wear)
    elif kind == "roll":
        sur, need = _net(home, WX[s], LD[s])
        r = rolling_dispatch(home, sur, need, year_prices(tou, len(need)), tou.export, wear)
    elif kind == "rule":   # the better of the half and full grid fill, as energy-tou reports
        r = min((rule_run(home, WX[s], LD[s], tou, "peak", g) for g in (0.5, 1.0)), key=lambda x: x["cost"])
    else:                  # greedy
        r = rule_run(home, WX[s], LD[s], tou, "greedy", 0.0)
    cyc = r["throughput"] / (home.batt_kwh * home.usable)
    return be(base - r["cost"], home, r["throughput"]), be(base - r["cost"], home, r["throughput"], True), cyc, r["cost"], base


def avg(home, tou, kind, wear=0.0):
    rs = [row(home, tou, s, kind, wear) for s in SEEDS]
    return [statistics.mean(r[i] for r in rs) for i in range(5)]


p("Assumed inputs as energy-tou: 8,000 kWh/yr load, 6 kW PV, 90% round trip, C/2, export $0.05, 6% discount, 15 y life cap.")
p(f"Cycle life for the life-limited column: {CYC_LIFE} full cycles (assumed). Mean of 10 weather seeds. Perfect foresight inside each LP.")
p()
h10 = Home(6.0, batt_kwh=10.0)
p("A. Dispatch rule against optimiser, 10 kWh, TOU tariff, no wear charge in the optimiser")
p("controller breakeven breakeven_life_limited cycles_per_year annual_bill")
for name, tou, kind in (("flat_greedy", FLAT, "greedy"), ("tou_greedy", TOU, "greedy"), ("tou_best_rule", TOU, "rule"),
                        ("tou_lp_36h_rolling", TOU, "roll"), ("tou_lp_year", TOU, "lp")):
    b, bl, cyc, cost, base = avg(h10, tou, kind)
    p(f"{name} {b:.0f} {bl:.0f} {cyc:.0f} {cost:.0f}")
p(f"no_battery_bill_tou {avg(h10, TOU, 'greedy')[4]:.0f}")
p()
p("B. Wear charge in the optimiser ($ per kWh the battery delivers), 10 kWh, TOU tariff, year LP")
p("wear breakeven breakeven_life_limited cycles_per_year annual_bill")
for w in (0.0, 0.02, 0.05, 0.10, 0.20):
    b, bl, cyc, cost, _ = avg(h10, TOU, "lp", w)
    p(f"{w:.2f} {b:.0f} {bl:.0f} {cyc:.0f} {cost:.0f}")
p()
p("C. By battery size (TOU tariff): best rule vs year LP, life-limited break-even $/kWh (LP at wear 0.00 / 0.05)")
p("batt_kwh best_rule lp_wear0 lp_wear005 flat_greedy")
for b_kwh in (2.5, 5, 10, 15, 20):
    h = Home(6.0, batt_kwh=float(b_kwh))
    r = avg(h, TOU, "rule")[1]
    l0 = avg(h, TOU, "lp", 0.0)[1]
    l5 = avg(h, TOU, "lp", 0.05)[1]
    fl = avg(h, FLAT, "greedy")[1]
    p(f"{b_kwh} {r:.0f} {l0:.0f} {l5:.0f} {fl:.0f}")
p()
p("D. By peak price (off-peak 0.15, shoulder 0.28), 10 kWh: life-limited break-even $/kWh, best rule vs LP at wear 0.05")
p("peak_price best_rule lp")
for pk in (0.28, 0.35, 0.45, 0.55, 0.70):
    tou = Tou(tuple(0.15 if (h >= 21 or h < 7) else pk if 16 <= h < 21 else 0.28 for h in range(24)))
    p(f"{pk:.2f} {avg(h10, tou, 'rule')[1]:.0f} {avg(h10, tou, 'lp', 0.05)[1]:.0f}")
p()
p("E. No PV (10 kWh, TOU): pure arbitrage, life-limited break-even $/kWh, best rule vs LP at wear 0.00 / 0.05 / 0.10")
h0 = Home(0.0, batt_kwh=10.0)
p(f"best_rule {avg(h0, TOU, 'rule')[1]:.0f} lp_wear0 {avg(h0, TOU, 'lp', 0.0)[1]:.0f} lp_wear005 {avg(h0, TOU, 'lp', 0.05)[1]:.0f} lp_wear010 {avg(h0, TOU, 'lp', 0.10)[1]:.0f}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
