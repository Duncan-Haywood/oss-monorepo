"""Writes results.txt: mass/energy balance per printer copy for the three seed shops."""
import os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from dataclasses import replace
from selfrep_materials.balance import Params, SHOPS, balance, melt_energy_kwh_per_kg, vitamin_mass

OUT = os.path.join(os.path.dirname(__file__), "results.txt")
lines = []
w = lines.append
CASES = [("printer", "lm8uu"), ("printer+cnc+laser", "lm8uu"), ("printer+cnc+laser+casting", "lm8uu"),
         ("printer+cnc+laser+casting", "brass")]
base = Params()
w(f"Base parameters (ASSUMED): {base}")
w(f"Aluminium melt energy at 100% efficiency: {melt_energy_kwh_per_kg(1.0):.3f} kWh/kg; at base efficiency: {melt_energy_kwh_per_kg(base.furnace_eff):.3f} kWh/kg")
w("")
for rec in (False, True):
    w(f"== recycling {'ON' if rec else 'OFF'}: imported kg per printer copy ==")
    for sh, var in CASES:
        b = balance(var, SHOPS[sh], base, rec)
        parts = ", ".join(f"{k} {v:.3f}" for k, v in sorted(b["imports_kg"].items(), key=lambda kv: -kv[1]))
        w(f"{sh:28s} [{var}] total {b['total_import_kg']:.3f} kg | scrap lost {b['scrap_lost_kg']:.3f} | energy {b['total_energy_kwh']:.2f} kWh")
        w(f"    {parts}")
    w("")
w("== energy split (recycling ON), kWh per copy ==")
for sh, var in CASES:
    b = balance(var, SHOPS[sh], base, True)
    w(f"{sh:28s} [{var}] " + ", ".join(f"{k} {v:.2f}" for k, v in b["energy_kwh"].items()))
w("")
w("== virgin filament (kg) vs recycled-share cap phi and scrap recovery r (printer alone, s=0.10) ==")
w("phi\\r   " + "  ".join(f"{r:5.2f}" for r in (0.0, 0.4, 0.8, 1.0)))
for phi in (0.0, 0.1, 0.2, 0.3, 0.5, 1.0):
    row = [balance("lm8uu", SHOPS["printer"], replace(base, phi=phi, r=r))["imports_kg"]["filament (virgin)"] for r in (0.0, 0.4, 0.8, 1.0)]
    w(f"{phi:4.1f}   " + "  ".join(f"{x:5.3f}" for x in row))
w("")
w("== end-of-life plastic: virgin filament (kg) per copy, printer alone, base r=0.8, s=0.10 ==")
w("eol = retired printed plastic per copy / this copy's printed mass; filament need F = %.3f kg" % (balance("lm8uu", SHOPS["printer"], base, False)["imports_kg"]["filament (virgin)"]))
for phi in (0.3, 0.5, 0.8):
    row = [balance("lm8uu", SHOPS["printer"], replace(base, eol=e, phi=phi)) for e in (0.0, 0.25, 0.5, 1.0, 2.0)]
    w(f"phi={phi}: " + "  ".join(f"eol={e}: {r['imports_kg']['filament (virgin)']:.3f}" for e, r in zip((0.0, 0.25, 0.5, 1.0, 2.0), row)))
w("")
w("== Monte Carlo over process parameters (2000 draws, seed 0), shop = printer+cnc+laser+casting [lm8uu] ==")
rng = random.Random(0)
shares, tot_on, tot_off, red, en, dom = [], [], [], [], [], {}
for _ in range(2000):
    p = Params(s=rng.uniform(0.02, 0.30), r=rng.uniform(0.3, 1.0), phi=rng.uniform(0.0, 0.5),
               y_metal=rng.uniform(0.4, 0.9), m_loss=rng.uniform(0.02, 0.25),
               e_print=rng.uniform(4, 16), furnace_eff=rng.uniform(0.1, 0.5))
    on = balance("lm8uu", SHOPS["printer+cnc+laser+casting"], p, True)
    off = balance("lm8uu", SHOPS["printer+cnc+laser+casting"], p, False)
    shares.append(on["imports_kg"]["vitamins"] / on["total_import_kg"])
    tot_on.append(on["total_import_kg"]); tot_off.append(off["total_import_kg"])
    red.append(1 - on["total_import_kg"] / off["total_import_kg"]); en.append(on["total_energy_kwh"])
    top = max((k for k in on["imports_kg"] if k != "vitamins"), key=lambda k: on["imports_kg"][k])
    dom[top] = dom.get(top, 0) + 1
def q(xs, a): xs = sorted(xs); return xs[int(a * (len(xs) - 1))]
def rng_s(xs, f="{:.3f}"): return f"median {f.format(q(xs,.5))} [5-95%: {f.format(q(xs,.05))} to {f.format(q(xs,.95))}]"
w("vitamin share of imported mass: " + rng_s(shares))
w("total imported mass, recycling ON (kg): " + rng_s(tot_on))
w("total imported mass, recycling OFF (kg): " + rng_s(tot_off))
w("import reduction from recycling: " + rng_s(red))
w("electric energy per copy (kWh): " + rng_s(en, "{:.1f}"))
w("largest non-vitamin import, number of draws: " + str(dom))
w("")
w("== vitamin mass (kg) per copy, by shop ==")
for sh, var in CASES:
    w(f"{sh:28s} [{var}] {vitamin_mass(var, SHOPS[sh]):.3f}")
open(OUT, "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
