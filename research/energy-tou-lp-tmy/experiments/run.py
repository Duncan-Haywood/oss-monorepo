"""Experiments for energy-tou-lp-tmy. Deterministic; writes results.txt.
    PYTHONPATH=src:../energy-tou-lp/src:../energy-tou/src:../energy-home/src python experiments/run.py
"""
import statistics
from pathlib import Path
import numpy as np
from energy_home import Home, year_load, year_weather, capital_recovery
from energy_tou import TOU
from energy_tou_lp.model import rule_run, no_battery_bill, year_prices
from energy_tou_lp_tmy import SITES, load_ghi, clear_sky, tmy_dispatch, day_errors

HERE = Path(__file__).resolve().parent
SEEDS = range(5)
LD = {s: year_load(8000, s) for s in SEEDS}
RATE, LIFE, CYC_LIFE, WEAR = 0.06, 15, 4000, 0.05
PR = year_prices(TOU, 8760)
out = []


def p(s=""):
    out.append(s)
    print(s, flush=True)


def be(saving, home, thr):
    life = min(LIFE, CYC_LIFE / (thr / (home.batt_kwh * home.usable))) if thr > 0 else LIFE
    return saving / (home.batt_kwh * capital_recovery(RATE, life))


def run(home, ghi, cs, pv_kind, load_kind="persistence"):
    """Mean over load seeds of (saving $/yr, life-limited break-even $/kWh, cycles/yr, annual bill)."""
    rows = []
    for s in SEEDS:
        base = no_battery_bill(home, ghi, LD[s], TOU)
        if pv_kind == "rule":
            r = min((rule_run(home, ghi, LD[s], TOU, "peak", g) for g in (0.5, 1.0)), key=lambda x: x["cost"])
        else:
            r = tmy_dispatch(home, ghi, cs, LD[s], PR, TOU.export, pv_kind, load_kind, WEAR)
        rows.append((base - r["cost"], be(base - r["cost"], home, r["throughput"]),
                     r["throughput"] / (home.batt_kwh * home.usable), r["cost"]))
    return [statistics.mean(x[i] for x in rows) for i in range(4)]


h10 = Home(6.0, batt_kwh=10.0)
p("Weather: PVGIS-ERA5 typical-meteorological-year hourly GHI (data/*.csv). Load: energy-home synthetic shape, 8,000 kWh/yr, 5 noise seeds (only the load differs by seed).")
p("Tariff and battery as energy-tou-lp: assumed three-band TOU, 6 kW PV, 10 kWh, 90% round trip, C/2, export $0.05, 6% discount, 4,000-cycle life (assumed). Rolling 36 h plan, 24 h committed, wear $0.05/kWh.")
p()
p("A. Forecast skill alone (day-ahead PV forecast made at local midnight, days 8-364): hourly nRMSE (RMSE / mean daylight GHI), daily-energy MAE / mean daily energy")
p("site annual_GHI_kWh_m2 daily_kc_mean lag1_autocorr_daily_kc persistence_nrmse smart_nrmse smart_week_nrmse persistence_daily_mae smart_daily_mae smart_week_daily_mae")
data = {}
for site in SITES:
    g, cs = load_ghi(site), clear_sky(site)
    data[site] = (g, cs)
    kc = g.reshape(365, 24).sum(1) / np.maximum(cs.reshape(365, 24).sum(1), 1)
    ac = np.corrcoef(kc[:-1], kc[1:])[0, 1]
    e = [day_errors(k, g, cs) for k in ("persistence", "smart", "smart_week")]
    p(f"{site} {g.sum() / 1000:.0f} {kc.mean():.2f} {ac:.2f} " + " ".join(f"{x[0]:.2f}" for x in e) + " " + " ".join(f"{x[1]:.2f}" for x in e))
from energy_home import clear_sky_ghi
ac_syn = []
for sd in SEEDS:
    syn = np.array(year_weather(sd)).reshape(365, 24)
    csyn = np.array([[clear_sky_ghi(40.0, d, h) for h in range(24)] for d in range(365)])
    kc = syn.sum(1) / csyn.sum(1)
    ac_syn.append(np.corrcoef(kc[:-1], kc[1:])[0, 1])
p(f"synthetic energy-home weather (lat 40, mean of {len(ac_syn)} seeds) lag1_autocorr_daily_kc {np.mean(ac_syn):.2f}")
p()
p("B. Controller by PV forecast, 10 kWh (load forecast = yesterday unless noted): saving per year over no battery / life-limited break-even $/kWh / cycles per year / annual bill")
p("site controller saving breakeven cycles bill share_of_gap_rule_to_perfect")
for site, (g, cs) in data.items():
    res = {}
    for name, kind, lk in (("best_rule", "rule", None), ("persistence", "persistence", "persistence"),
                           ("smart", "smart", "persistence"), ("smart_week", "smart_week", "persistence"),
                           ("smart_perfect_load", "smart", "perfect"), ("perfect", "perfect", "perfect")):
        res[name] = run(h10, g, cs, kind, lk)
    gap = res["perfect"][0] - res["best_rule"][0]
    for name, r in res.items():
        p(f"{site} {name} {r[0]:.0f} {r[1]:.0f} {r[2]:.0f} {r[3]:.0f} {(r[0] - res['best_rule'][0]) / gap:.2f}")
p()
p("C. By battery size, Golden CO: life-limited break-even $/kWh, best rule / persistence / smart / perfect")
p("batt_kwh best_rule persistence smart perfect")
g, cs = data["golden-co"]
for b_kwh in (2.5, 5, 10, 15, 20):
    h = Home(6.0, batt_kwh=float(b_kwh))
    p(f"{b_kwh} " + " ".join(f"{run(h, g, cs, k, 'perfect' if k == 'perfect' else 'persistence')[1]:.0f}" for k in ("rule", "persistence", "smart", "perfect")))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
