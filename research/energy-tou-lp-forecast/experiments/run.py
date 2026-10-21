"""Experiments for energy-tou-lp-forecast. Deterministic; writes results.txt.
    PYTHONPATH=src:../energy-tou-lp/src:../energy-tou/src:../energy-home/src python experiments/run.py
"""
import statistics
import sys
from pathlib import Path
import numpy as np
from energy_home import Home, year_weather, year_load, capital_recovery
from energy_tou import TOU
from energy_tou_lp.model import rule_run, no_battery_bill, year_prices
from energy_tou_lp_forecast import forecast_dispatch

HERE = Path(__file__).resolve().parent
SEEDS = range(10)
WX = {s: year_weather(s) for s in SEEDS}
LD = {s: year_load(8000, s) for s in SEEDS}
RATE, LIFE, CYC_LIFE = 0.06, 15, 4000
WEAR = 0.05
PR = year_prices(TOU, 8760)
out = []


def p(s=""):
    out.append(s)
    print(s, flush=True)


def pv_kw(home, s):
    return np.array([home.pv_kw * home.perf_ratio * g / 1000.0 for g in WX[s]])


def be(saving, home, thr):
    life = min(LIFE, CYC_LIFE / (thr / (home.batt_kwh * home.usable))) if thr > 0 else LIFE
    return saving / (home.batt_kwh * capital_recovery(RATE, life))


def run(home, kind, sigma=0.0):
    """Mean over seeds of (saving $/yr, life-limited break-even $/kWh, cycles/yr, bill)."""
    rows = []
    for s in SEEDS:
        base = no_battery_bill(home, WX[s], LD[s], TOU)
        if kind == "rule":
            r = min((rule_run(home, WX[s], LD[s], TOU, "peak", g) for g in (0.5, 1.0)), key=lambda x: x["cost"])
        else:
            r = forecast_dispatch(home, pv_kw(home, s), LD[s], PR, TOU.export, kind, sigma, WEAR, seed=s)
        rows.append((base - r["cost"], be(base - r["cost"], home, r["throughput"]),
                     r["throughput"] / (home.batt_kwh * home.usable), r["cost"]))
    return [statistics.mean(x[i] for x in rows) for i in range(4)]


h10 = Home(6.0, batt_kwh=10.0)
p("Assumed inputs as energy-tou-lp: 8,000 kWh/yr load, 6 kW PV, 90% round trip, C/2, export $0.05, 6% discount, 4,000-cycle life (assumed).")
p(f"Rolling 36 h plan, 24 h committed, wear charge ${WEAR:.2f}/kWh in the optimiser, executed on actual PV and load. Mean of 10 weather seeds.")
p()
p("A. Controller by forecast, 10 kWh, TOU tariff")
p("controller saving_per_year breakeven_life_limited cycles_per_year annual_bill share_of_gap_rule_to_perfect")
res = {}
for name, kind, sg in (("best_rule", "rule", 0), ("persistence", "persistence", 0), ("week_mean", "week_mean", 0),
                       ("noisy_100pct", "noisy", 1.0), ("noisy_50pct", "noisy", 0.5), ("noisy_25pct", "noisy", 0.25),
                       ("noisy_10pct", "noisy", 0.1), ("perfect", "perfect", 0)):
    res[name] = run(h10, kind, sg)
gap = res["perfect"][0] - res["best_rule"][0]
for name, r in res.items():
    p(f"{name} {r[0]:.0f} {r[1]:.0f} {r[2]:.0f} {r[3]:.0f} {(r[0] - res['best_rule'][0]) / gap:.2f}")
p()
p("B. By battery size (TOU): life-limited break-even $/kWh, best rule / week_mean forecast / persistence / perfect")
p("batt_kwh best_rule week_mean persistence perfect")
for b_kwh in (2.5, 5, 10, 15, 20):
    h = Home(6.0, batt_kwh=float(b_kwh))
    p(f"{b_kwh} " + " ".join(f"{run(h, k)[1]:.0f}" for k in ("rule", "week_mean", "persistence", "perfect")))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
