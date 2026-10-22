"""Experiments for energy-tou-lp-replan. Deterministic; writes results.txt.
    PYTHONPATH=src:../energy-tou-lp-tmy/src:../energy-tou-lp/src:../energy-tou/src:../energy-home/src python experiments/run.py
"""
import statistics
from multiprocessing import Pool
from pathlib import Path
from energy_home import Home, year_load, capital_recovery
from energy_tou import TOU
from energy_tou_lp.model import rule_run, no_battery_bill, year_prices
from energy_tou_lp_tmy import SITES, load_ghi, clear_sky
from energy_tou_lp_replan import replan_dispatch

HERE = Path(__file__).resolve().parent
SEEDS = range(3)
LD = {s: year_load(8000, s) for s in SEEDS}
RATE, LIFE, CYC_LIFE, WEAR = 0.06, 15, 4000, 0.05
PR = year_prices(TOU, 8760)
H10 = Home(6.0, batt_kwh=10.0)
STEPS = (24, 12, 6, 3, 1)
KINDS = ("persistence", "smart", "nowcast", "perfect")
DATA = {s: (load_ghi(s), clear_sky(s)) for s in SITES}


def be(saving, home, thr):
    life = min(LIFE, CYC_LIFE / (thr / (home.batt_kwh * home.usable))) if thr > 0 else LIFE
    return saving / (home.batt_kwh * capital_recovery(RATE, life))


def job(a):
    site, kind, step, seed, lk, tau = a
    g, cs = DATA[site]
    base = no_battery_bill(H10, g, LD[seed], TOU)
    if kind == "rule":
        r = min((rule_run(H10, g, LD[seed], TOU, "peak", x) for x in (0.5, 1.0)), key=lambda x: x["cost"])
    else:
        r = replan_dispatch(H10, g, cs, LD[seed], PR, TOU.export, kind, lk, WEAR, step=step, tau=tau)
    return a, (base - r["cost"], be(base - r["cost"], H10, r["throughput"]), r["throughput"] / (H10.batt_kwh * H10.usable))


def mean(res, key):
    v = [res[(key[0], key[1], key[2], s, key[3], key[4])] for s in SEEDS]
    return [statistics.mean(x[i] for x in v) for i in range(3)]


if __name__ == "__main__":
    jobs = []
    for site in SITES:
        for s in SEEDS:
            jobs.append((site, "rule", 24, s, None, 3.0))
            for kind in KINDS:
                lk = "perfect" if kind == "perfect" else "persistence"
                for st in STEPS:
                    jobs.append((site, kind, st, s, lk, 3.0))
            for st in (24, 3, 1):          # nowcast with a perfect load forecast, to separate PV from load
                jobs.append((site, "nowcast", st, s, "perfect", 3.0))
    for tau in (1.0, 6.0, 12.0):           # relaxation time of the nowcast, Golden only
        for s in SEEDS:
            jobs.append(("golden-co", "nowcast", 1, s, "persistence", tau))
    with Pool() as pool:
        res = dict(pool.imap_unordered(job, jobs, chunksize=1))
    out = []

    def p(s=""):
        out.append(s)
        print(s, flush=True)

    p("Weather: PVGIS-ERA5 typical-meteorological-year hourly GHI (energy-tou-lp-tmy/data). Load: energy-home synthetic shape, 8,000 kWh/yr, 3 noise seeds.")
    p("Tariff, battery, LP and wear charge as energy-tou-lp-tmy (assumed). 10 kWh, 6 kW PV. The plan covers 36 h and is re-made every `step` hours; step 24 = energy-tou-lp-tmy.")
    p()
    p("A. Saving over no battery ($/yr, mean of seeds) by forecast and re-plan interval; load forecast = yesterday (perfect forecast: perfect load)")
    p("site forecast " + " ".join(f"step{st}" for st in STEPS))
    for site in SITES:
        rule = mean(res, (site, "rule", 24, None, 3.0))[0]
        p(f"{site} best_rule {rule:.0f}")
        for kind in KINDS:
            lk = "perfect" if kind == "perfect" else "persistence"
            p(f"{site} {kind} " + " ".join(f"{mean(res, (site, kind, st, lk, 3.0))[0]:.0f}" for st in STEPS))
    p()
    p("B. Share of the rule-to-perfect gap kept (step 24 -> step 1) and life-limited break-even $/kWh (step 24 / step 1) and cycles per year (step 24 / step 1)")
    p("site forecast share24 share1 breakeven24 breakeven1 cycles24 cycles1")
    for site in SITES:
        rule = mean(res, (site, "rule", 24, None, 3.0))[0]
        perf = mean(res, (site, "perfect", 24, "perfect", 3.0))[0]
        for kind in ("persistence", "smart", "nowcast"):
            a, b = mean(res, (site, kind, 24, "persistence", 3.0)), mean(res, (site, kind, 1, "persistence", 3.0))
            p(f"{site} {kind} {(a[0] - rule) / (perf - rule):.2f} {(b[0] - rule) / (perf - rule):.2f} {a[1]:.0f} {b[1]:.0f} {a[2]:.0f} {b[2]:.0f}")
    p()
    p("C. Nowcast with a perfect load forecast (saving $/yr at step 24 / 3 / 1), against nowcast with yesterday's load")
    p("site step24 step3 step1 | yesterday_load step24 step3 step1")
    for site in SITES:
        a = [mean(res, (site, "nowcast", st, "perfect", 3.0))[0] for st in (24, 3, 1)]
        b = [mean(res, (site, "nowcast", st, "persistence", 3.0))[0] for st in (24, 3, 1)]
        p(f"{site} " + " ".join(f"{x:.0f}" for x in a) + " | " + " ".join(f"{x:.0f}" for x in b))
    p()
    p("D. Golden CO nowcast relaxation time tau (h), hourly re-planning: saving $/yr")
    p("tau saving")
    for tau in (1.0, 3.0, 6.0, 12.0):
        p(f"{tau:g} {mean(res, ('golden-co', 'nowcast', 1, 'persistence', tau))[0]:.0f}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
