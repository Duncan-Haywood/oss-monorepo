"""Write experiments/results.txt.   PYTHONPATH=src python experiments/run.py"""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from infra_cement import *  # noqa: E402

out = []
w = out.append

w("A. Stoichiometry (computed from molar masses)")
w(f"calcination kg CO2 per t CaO: {1000*M_CO2/M_CAO:.1f}; per t clinker at CaO 0.65: {calcination_kgCO2_per_t_clinker():.1f}")
w(f"kaolinite dehydroxylation mass loss (water, no CO2): {100*dehydroxylation_mass_loss():.2f} %")

w("B. Balance per tonne of cement, baseline parameters: blend, clinker, calcination, kiln fuel, clay fuel, electricity, other, total, GJ, change vs OPC %")
opc = balance(BLENDS[0])["total"]
for b in BLENDS:
    r = balance(b)
    w(f"{b.name} | {b.clinker:.2f} | {r['calcination']:.0f} | {r['kiln_fuel']:.0f} | {r['clay_fuel']:.0f} | {r['electricity']:.0f} | {r['other']:.0f} | {r['total']:.0f} | {r['thermal_GJ']:.2f} | {100*(r['total']/opc-1):.0f}")

w("C. LC3-50 saving vs OPC (%) when one parameter is swept to its ends (others baseline)")
sweeps = [("clay_calcination_GJ_per_t", [1, 2, 3]), ("grid_kgCO2_per_kWh", [0, 0.4, 0.8]),
          ("grinding_kWh_per_t_cement", [70, 100, 130]), ("kiln_heat_GJ_per_t_clinker", [3.2, 3.4, 3.6]),
          ("fuel_kgCO2_per_GJ", [60, 94.6, 100])]
for name, vals in sweeps:
    xs = []
    for v in vals:
        o = {name: v}
        xs.append(100 * (1 - balance(BLENDS[5], o)["total"] / balance(BLENDS[0], o)["total"]))
    w(f"{name} | " + " | ".join(f"{v}: {x:.1f}" for v, x in zip(vals, xs)))
w("slag_kgCO2_per_t sweep, slag-50 saving vs OPC (%): " + " | ".join(
    f"{v}: {100*(1-balance(BLENDS[2], {'slag_kgCO2_per_t': v})['total']/opc):.1f}" for v in [0, 52, 100, 150]))

w("D. Lowest clinker content keeping a strength class, by 28-day OPC reference strength (MPa): class 32.5 | 42.5 (28-day study table)")
for s0 in [40, 45, 50, 55, 60, 65]:
    row = []
    for cls in ["32.5", "42.5"]:
        c = min_clinker_for_class(s0, cls)
        row.append("none" if c is None else (f"{c:.3f}" if c > 0.5 else "0.500 or less (table ends)"))
    w(f"{s0} | " + " | ".join(row))

w("E. CO2 of an LC3 cement at the lowest clinker content keeping class 42.5 (kg/t, saving vs OPC %), by OPC reference strength")
for s0 in [45, 50, 55, 60, 65]:
    c = min_clinker_for_class(s0, "42.5")
    if c is None:
        w(f"{s0} | none"); continue
    clay = (0.95 - c) * 2 / 3; ls = (0.95 - c) / 3
    r = balance(Blend("x", c, clay=clay, limestone=ls))["total"]
    w(f"{s0} | {c:.3f} | {r:.0f} | {100*(1-r/opc):.0f}")

w("F. Same, with the 91-day table (a 91-day class is not an EN 197-1 class: shown for the strength-gain argument only)")
for s0 in [45, 50, 55]:
    c = min_clinker_for_class(s0, "42.5", LC3_REL_91D)
    w(f"{s0} | " + ("none" if c is None else (f"{c:.3f}" if c > 0.5 else "0.500 or less (table ends)")))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
