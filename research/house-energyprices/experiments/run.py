"""house-energy's optimum with EIA prices instead of its invented ones. Deterministic.

    PYTHONPATH=src:../house-energy/src:../house-framing/src python experiments/run.py > experiments/results.txt
"""
from dataclasses import replace

from house_energy import CLIMATES, SYSTEMS, Prices, baseline, evaluate, optimise
from house_energyprices.prices import STATE, prices_for

fmt = lambda p: f"{p.wall}, attic R-{p.attic_r}, U {p.window_u:.2f}, {p.ach50:g} ACH50, slab {'R-10' if p.slab_r else 'bare'}"
b = baseline()
default = Prices()
print(f"A. prices: house-energy's invented defaults (gas ${default.gas_per_therm:.2f}/therm, electricity ${default.elec_per_kwh:.2f}/kWh) against EIA")
for c, st in STATE.items():
    p = prices_for(st)
    print(f"  {c:18s}{st:10s} gas ${p.gas_per_therm:.2f}/therm  electricity ${p.elec_per_kwh:.3f}/kWh")
print()
print("B. cost-optimal package (default prices -> EIA prices); saving over the baseline in NPC")
print(f"  {'climate':18s}{'system':18s}{'default saving':>16s}{'EIA saving':>12s}  changed?  EIA optimum")
changed = 0
rows = 0
for c, st in STATE.items():
    for s in SYSTEMS:
        d, de = optimise(c, s)
        e, ee = optimise(c, s, prices_for(st))
        ds = evaluate(b, c, s)["npc"] - de["npc"]
        es = evaluate(b, c, s, prices_for(st))["npc"] - ee["npc"]
        diff = fmt(d) != fmt(e)
        changed += diff
        rows += 1
        print(f"  {c:18s}{s:18s}{ds:12,.0f}{es:12,.0f}  {'yes' if diff else 'no ':8s}{fmt(e)}")
print(f"  optimum package changes in {changed} of {rows} cases")
print()
print("C. annual heating + cooling energy bill of the EIA-optimal house, gas furnace + AC against heat pump")
print(f"  {'climate':18s}{'gas+AC $/yr':>12s}{'heat pump $/yr':>16s}{'cheaper to run':>16s}")
for c, st in STATE.items():
    pr = prices_for(st)
    g = optimise(c, "gas furnace + AC", pr)[1]["annual_cost"]
    h = optimise(c, "heat pump", pr)[1]["annual_cost"]
    print(f"  {c:18s}{g:12,.0f}{h:16,.0f}{('heat pump' if h < g else 'gas'):>16s}")
print()
print("D. one upgrade at a time at EIA prices (gas): attic R-30 to R-49 and windows U 0.35 to 0.27; simple payback in years")
for c, st in STATE.items():
    pr = prices_for(st)
    s = "gas furnace + AC"
    base = evaluate(b, c, s, pr)
    out = []
    for name, up in (("attic R-49", dict(attic_r=49)), ("windows U 0.27", dict(window_u=0.27)), ("3 ACH50", dict(ach50=3.0))):
        u = evaluate(replace(b, **up), c, s, pr)
        dc, ds = u["first_cost"] - base["first_cost"], base["annual_cost"] - u["annual_cost"]
        out.append(f"{name}: +${dc:,.0f} saves ${ds:,.0f}/yr ({dc / ds:,.0f} y)" if ds > 0.5 else f"{name}: no saving")
    print(f"  {c:18s}" + "; ".join(out))
