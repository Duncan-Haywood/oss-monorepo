"""Next step 2: how much is heat-pump diversity worth to the transformer?   PYTHONPATH=src python experiments/run_diversity.py

Replaces the fully coincident hourly heat-pump draw with a population of thermostat-controlled two-node homes at
one-minute resolution (src/infra_transformer/diversity.py), 20 independent 10-home groups per case, and scores
each group on the same transformer as results.txt. Deterministic (fixed seeds). Writes experiments/diversity.txt.
About 10 minutes on one core.
"""
from dataclasses import replace
from pathlib import Path
import numpy as np
from infra_transformer import (Xfmr, Params, load_inputs, scenario_load, heat_pump_kw, ev_kw, annual_lol_pct,
                               simulate_dt, annual_lol_pct_dt, Pop, simulate_population, hourly_mean)

HERE = Path(__file__).resolve().parent
inp = load_inputs()
P = Params()
SEEDS, HOMES = 20, 10
TAU_W = 0.1   # winding (hot-spot) time constant, h; recalled ~4-7 min for distribution units, swept below
out = []


def p(s=""):
    out.append(s)
    print(s, flush=True)


def rng_txt(a):
    a = np.asarray(a, float)
    f = (lambda v: ">100" if v > 100 else f"{v:.3g}")
    return f"{f(a.mean())} [{f(a.min())}-{f(a.max())}]"


def minute(hourly):
    return np.repeat(np.asarray(hourly, float), 60, axis=-1)


VARIANTS = [
    ("VS", Pop(single_stage=False)),
    ("SS", Pop()),
    ("SS setback sync", Pop(setback_k=3.0)),
    ("SS setback sync nostrip", Pop(setback_k=3.0, strip_kw=0.0)),
    ("SS setback stagger4h", Pop(setback_k=3.0, stagger_h=4.0)),
    ("VS setback sync", Pop(single_stage=False, setback_k=3.0)),
]

p("Heat-pump diversity: 20 groups x 10 homes, two-node homes at 1-minute steps, UA lognormal (mean 0.42 kW/K, cv 0.25),")
p("setpoint 20 +/- 1 C, deadband 1 K, capacity = design heat load at the 1st-percentile hourly temperature, 5 kW strip")
p("as stage 2 (1 K below the band). VS = variable-speed (modulating), SS = single-stage (on/off). Setback: 3 K, 22:00-06:00")
p("(sync) or ending uniformly 04:00-08:00 per home (stagger4h). Base load H0 and EVs as in results.txt (hourly, held flat")
p("within the hour). Transformer as in results.txt, sized to the baseline (no heat pump, no EV) peak / loading.")
p("Ranges are mean [min-max] over the 20 groups. LOL columns: hourly = hourly-mean load on the hourly model (as results.txt);")
p(f"1min = one-minute load with the hot-spot gradient lagged by tau_w = {TAU_W} h.")
p()

store = {}
for clim in ("greensboro", "sandpoint"):
    temp = inp[clim]
    base = scenario_load(inp, clim, P)                          # 10 homes, no HP, no EV (hourly)
    coinc_hp = P.homes * heat_pump_kw(temp, P)
    p(f"== {clim}")
    p("A. Heat-pump load of the 10-home group")
    p("case kWh_per_home peak_hourly_kW peak_1min_kW coincidence_factor(1min group peak / sum of home peaks) strip_h_per_home")
    p(f"coincident(model.py) {coinc_hp.sum()/HOMES:.0f} {coinc_hp.max():.1f} {coinc_hp.max():.1f} 1 0")
    series = {"coincident": (None, coinc_hp)}
    for name, pop in VARIANTS:
        g, info = simulate_population(temp, P, pop, HOMES, SEEDS, seed0=1)
        gh = hourly_mean(g)
        cf = g.max(axis=1) / info["home_peak"].sum(axis=1)
        p(f"{name} {g.sum(1).mean()/60/HOMES:.0f} {rng_txt(gh.max(1))} {rng_txt(g.max(1))} {rng_txt(cf)} {info['strip_h_per_home']:.1f}")
        series[name] = (g, gh)
        if clim == "greensboro" and name == "SS":
            # sub-hourly peaking by temperature: mean over hours of (max minute in the hour / hourly mean)
            bins = [(-20, -5), (-5, 0), (0, 5), (5, 10), (10, 16)]
            pk = g.reshape(SEEDS, -1, 60).max(axis=2) / np.maximum(gh, 1e-9)
            row = []
            for lo, hi in bins:
                m = (temp >= lo) & (temp < hi)
                row.append(f"[{lo},{hi}):{pk[:, m].mean():.2f}(n={int(m.sum())})")
            store["peaking"] = " ".join(row)
    p(f"design temperature (1st percentile hourly) {info['t_design']:.1f} C, mean heat-pump capacity {info['qcap_mean']:.1f} kW thermal")
    if "peaking" in store and clim == "greensboro":
        p("SS group: mean (max 1-min / hourly mean) within the hour, by outdoor temperature bin, C: " + store["peaking"])
    p()

    p("B. Annual transformer loss of life, %/yr, 100 % heat pumps (and 100 % EVs where named)")
    p("loading ev case LOL_hourly LOL_1min peak_pu_1min")
    for loading in (0.5, 0.7):
        x = replace(Xfmr(1.0), rated_kva=base.max() / loading)
        for ev in ("none", "uncoord", "smart"):
            for name, (g, gh) in series.items():
                if g is None:
                    tot_h = base + gh
                    evl = ev_kw(tot_h, 0 if ev == "none" else HOMES, P, ev == "smart")
                    tot_h = tot_h + evl
                    lh = annual_lol_pct(tot_h, temp, x)
                    l1 = annual_lol_pct_dt(minute(tot_h), minute(temp), x, 1 / 60, TAU_W)
                    p(f"{loading} {ev} {name} {rng_txt([lh])} {rng_txt([l1])} {tot_h.max()/x.rated_kva:.2f}")
                    continue
                tot_h = base[None, :] + gh
                evh = np.array([ev_kw(tot_h[s], 0 if ev == "none" else HOMES, replace(P, seed=s), ev == "smart")
                                for s in range(SEEDS)])
                tot_h = tot_h + evh
                tot_m = minute(base)[None, :] + g + minute(evh)
                lh = annual_lol_pct_dt(tot_h, temp, x, 1.0, 0.0)
                l1 = annual_lol_pct_dt(tot_m, minute(temp), x, 1 / 60, TAU_W)
                store[(clim, loading, ev, name)] = (lh, l1)
                p(f"{loading} {ev} {name} {rng_txt(lh)} {rng_txt(l1)} {rng_txt(tot_m.max(1)/x.rated_kva)}")
    p()

p("C. Sensitivity, Greensboro, 100 % heat pumps, no EV, loading 0.5: LOL_1min (%/yr) and 1-min group peak (kW)")
p("change SS SS_peak SS_setback_sync SSsb_peak")
temp = inp["greensboro"]
base = scenario_load(inp, "greensboro", P)
x = replace(Xfmr(1.0), rated_kva=base.max() / 0.5)
SENS = [("default", {}), ("ua_cv 0.10", dict(ua_cv=0.10)), ("ua_cv 0.40", dict(ua_cv=0.40)),
        ("t_set_sd 0", dict(t_set_sd=0.0)), ("t_set_sd 2", dict(t_set_sd=2.0)),
        ("deadband 0.5 K", dict(db=0.5)), ("deadband 2 K", dict(db=2.0)),
        ("size 0.8", dict(size=0.8)), ("size 1.25", dict(size=1.25)),
        ("strip 0 kW", dict(strip_kw=0.0)), ("strip 10 kW", dict(strip_kw=10.0)),
        ("mass Cm/UA 15 h", dict(cm_per_ua=15.0)), ("mass Cm/UA 60 h", dict(cm_per_ua=60.0)),
        ("air Ca/UA 0.7 h", dict(ca_per_ua=0.7)), ("air Ca/UA 2.7 h", dict(ca_per_ua=2.7))]
for name, kw in SENS:
    row = [name]
    for sb in (0.0, 3.0):
        g, _ = simulate_population(temp, P, replace(Pop(setback_k=sb), **kw), HOMES, SEEDS, seed0=1)
        l1 = annual_lol_pct_dt(minute(base)[None, :] + g, minute(temp), x, 1 / 60, TAU_W)
        row += [rng_txt(l1), f"{g.max(1).mean():.1f}"]
    p(" ".join(row))
g, _ = simulate_population(temp, P, Pop(), HOMES, SEEDS, seed0=1)
tot_m = minute(base)[None, :] + g
for tw in (0.0, 0.05, 0.15):
    p(f"tau_w {tw} h (SS, no setback): LOL_1min {rng_txt(annual_lol_pct_dt(tot_m, minute(temp), x, 1/60, tw))}")
p()

p("D. Group size: coincidence factor and 1-min peak per home (SS, no setback, Greensboro), 20 groups each")
p("homes cf peak_1min_kW_per_home peak_hourly_kW_per_home")
for n in (1, 2, 5, 10, 25, 50):
    g, info = simulate_population(temp, P, Pop(), n, SEEDS, seed0=1)
    cf = g.max(axis=1) / info["home_peak"].sum(axis=1)
    p(f"{n} {rng_txt(cf)} {g.max(1).mean()/n:.2f} {hourly_mean(g).max(1).mean()/n:.2f}")

(HERE / "diversity.txt").write_text("\n".join(out) + "\n")
