"""Deterministic experiments for infra-transformer; writes results.txt.   PYTHONPATH=src python experiments/run.py"""
from dataclasses import replace
from pathlib import Path
import numpy as np
from infra_transformer import Xfmr, Params, load_inputs, scenario_load, annual_lol_pct

HERE = Path(__file__).resolve().parent
inp = load_inputs()
P = Params()
FAA1 = 8760 / 180000 * 100          # %/yr when the insulation ages at its rated-life rate (FAA = 1)
out = []


def p(s=""):
    out.append(s)


def lol(load, climate, x):
    return annual_lol_pct(load, inp[climate], x)


def fmt(v):
    """Above 100 %/yr the insulation is gone within the year and the number carries no information."""
    return ">100(fail)" if v > 100 else f"{v:.3g}"


def xf_for(climate, loading, params=P, x0=Xfmr(1.0)):
    return replace(x0, rated_kva=scenario_load(inp, climate, params).max() / loading)


SC = [("base", dict()), ("EV 100% uncoord", dict(ev_frac=1.0)), ("EV 100% smart", dict(ev_frac=1.0, smart=True)),
      ("HP 100%", dict(hp_frac=1.0)), ("HP+EV uncoord", dict(hp_frac=1.0, ev_frac=1.0)),
      ("HP+EV smart", dict(hp_frac=1.0, ev_frac=1.0, smart=True))]

p("Inputs: 10 homes, BDEW H0 profile scaled to 10,800 kWh/yr/home, TMY ambient, heat pump UA 0.42 kW/K, balance 16 C,")
p("COP 3.2 at 8.3 C, +0.054/K (floor 1), EV 10 kWh/night at 7.2 kW, arrival 18 h +/- 1.5, transformer 55/25 K rise, R 3.2, n=m=0.8, tau 3 h.")
p(f"Reference: ageing at FAA = 1 for a year consumes {FAA1:.2f} % of insulation life (180,000 h).")
p()
p("A. Annual loss of life (% per year) by transformer loading and scenario. loading = baseline annual peak / kVA rating.")
for clim in ("greensboro", "sandpoint", "miami"):
    p(f"-- {clim}")
    p("loading kva " + " ".join(n.replace(" ", "_") for n, _ in SC))
    for loading in (0.5, 0.7):
        x = xf_for(clim, loading)
        vals = [lol(scenario_load(inp, clim, P, **kw), clim, x) for _, kw in SC]
        p(f"{loading:.1f} {x.rated_kva:.1f} " + " ".join(fmt(v) for v in vals))
p()
p("B. Peak load (kW, hourly) and peak hot spot, Greensboro, loading 0.7")
x = xf_for("greensboro", 0.7)
from infra_transformer import simulate
for n, kw in SC:
    ld = scenario_load(inp, "greensboro", P, **kw)
    th = simulate(ld, inp["greensboro"], x)[0]
    p(f"{n}: peak {ld.max():.1f} kW ({ld.max()/x.rated_kva:.2f} pu), peak hot spot {th.max():.0f} C, hours above 110 C {int((th>110).sum())}, above 140 C {int((th>140).sum())}, LOL {fmt(lol(ld,'greensboro',x))} %/yr")
p()
p(f"C. Electrified share (HP and EV together) at which loss of life first reaches the rated-life rate (>= {FAA1:.2f} pct per year); loading 0.7")
p("climate coordination share_at_threshold")
fr = np.linspace(0, 1, 21)
for clim in ("greensboro", "sandpoint", "miami"):
  for loading in (0.5, 0.7):
    x = xf_for(clim, loading)
    for smart in (False, True):
        res = None
        for f in fr:
            if lol(scenario_load(inp, clim, P, hp_frac=f, ev_frac=f, smart=smart), clim, x) >= FAA1:
                res = f; break
        p(f"{clim} loading {loading} {'smart' if smart else 'uncoord'} {'>100%' if res is None else f'{res*100:.0f}%'}")
p("   (HP-only and EV-only variants, same threshold, Greensboro loading 0.5)")
x = xf_for("greensboro", 0.5)
for nm, kw in (("HP only", dict(hp_frac=1)), ("EV only uncoord", dict(ev_frac=1)), ("EV only smart", dict(ev_frac=1, smart=True))):
    for f in fr:
        k2 = {a: b * f if a.endswith("frac") else b for a, b in kw.items()}
        if lol(scenario_load(inp, "greensboro", P, **k2), "greensboro", x) >= FAA1:
            p(f"{nm}: {f*100:.0f}%"); break
    else:
        p(f"{nm}: >100%")
p()
p("D. Uniform load growth multiplier that doubles loss of life versus the 1.0x baseline (all-load scaling, Greensboro)")
for loading in (0.5, 0.7, 0.9):
    x = xf_for("greensboro", loading)
    base = lol(scenario_load(inp, "greensboro", P), "greensboro", x)
    g = 1.0
    while lol(scenario_load(inp, "greensboro", P, growth=g), "greensboro", x) < 2 * base:
        g += 0.005
    g2 = g
    while lol(scenario_load(inp, "greensboro", P, growth=g2), "greensboro", x) < FAA1:
        g2 += 0.01
    p(f"loading {loading}: baseline {base:.3g} %/yr, growth to double {g:.3f}x, growth to reach {FAA1:.2f} %/yr {g2:.2f}x")
p()
p("E. Sensitivity (HP and EV in 50% of homes, Greensboro, rating sized to loading 0.5 with the default parameters): LOL uncoord / smart (%/yr) and ratio")
p("param value uncoord smart")
base_x = xf_for("greensboro", 0.5)
ld_u = scenario_load(inp, "greensboro", P, hp_frac=.5, ev_frac=.5)
ld_s = scenario_load(inp, "greensboro", P, hp_frac=.5, ev_frac=.5, smart=True)
for name, vals in (("d_to_r", (45.0, 55.0, 65.0)), ("d_h_r", (15.0, 25.0, 35.0)), ("r", (2.0, 3.2, 5.0)), ("n", (0.8, 0.9, 1.0)),
                   ("m", (0.8, 0.9, 1.0)), ("tau_to", (1.5, 3.0, 5.0))):
    for v in vals:
        x = replace(base_x, **{name: v})
        a, b = lol(ld_u, "greensboro", x), lol(ld_s, "greensboro", x)
        p(f"{name} {v} {fmt(a)} {fmt(b)}")
p("-- plant-side parameters (ratings re-sized to keep loading 0.5 on the baseline)")
for name, vals in (("ua_kw_per_k", (0.25, 0.42, 0.6)), ("cop_at_8", (2.5, 3.2, 4.0)), ("ev_kwh_day", (6.0, 10.0, 15.0)),
                   ("annual_kwh", (6000.0, 10800.0, 14000.0))):
    for v in vals:
        q = replace(P, **{name: v})
        x = xf_for("greensboro", 0.5, q)
        a = lol(scenario_load(inp, "greensboro", q, hp_frac=.5, ev_frac=.5), "greensboro", x)
        b = lol(scenario_load(inp, "greensboro", q, hp_frac=.5, ev_frac=.5, smart=True), "greensboro", x)
        p(f"{name} {v} {fmt(a)} {fmt(b)}")
p()
p("F. Annual loss of life (%/yr) against share of homes with a heat pump and an EV, Greensboro, loading 0.5")
p("share uncoord smart")
x = xf_for("greensboro", 0.5)
for f in np.linspace(0, 1, 11):
    a = lol(scenario_load(inp, "greensboro", P, hp_frac=f, ev_frac=f), "greensboro", x)
    b = lol(scenario_load(inp, "greensboro", P, hp_frac=f, ev_frac=f, smart=True), "greensboro", x)
    p(f"{f*100:.0f} {a:.4g} {b:.4g}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
