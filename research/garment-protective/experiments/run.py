import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "src"))
from garment_protective.model import *

A = FIBRES[1]
out = []
p = out.append
p("Fibre U* (m/s) and V50 ratio vs aramid at equal areal density")
for f in FIBRES:
    p(f"  {f.name:10s} U*={u_star(f):6.0f}  V50/V50_aramid={v50_ratio(f, A):.2f}")
p("\nAreal density needed to match aramid's V50, as a fraction of aramid's (sensitivity to exponent n)")
for n in (0.25, 0.5, 1.0):
    p(f"  n={n}: " + "  ".join(f"{f.name}={areal_density_ratio(f, A, n):.2f}" for f in FIBRES))
AREA = 0.5  # m2, assumed torso panel
p("\nA 4 kg/m2 aramid-equivalent torso panel (0.5 m2): mass, cost, thickness, bending stiffness")
for f in FIBRES:
    ad = 4.0 * areal_density_ratio(f, A, 0.5)
    g = garment(f, ad, AREA)
    sb = bending_stiffness(f, ad, 20, True); sf = bending_stiffness(f, ad, 20, False)
    p(f"  {f.name:10s} Ad={ad:5.2f} kg/m2 mass={g['mass_kg']:.2f} kg cost=${g['cost_usd']:.0f} "
      f"t={g['thickness_mm']:.1f} mm  EI bonded={sb:.2f} free(20 plies)={sf:.4f} N m")
p("\nSuit-like limit: thickness <= 3 mm and mass <= 1 kg for the panel -> max areal density, per fibre")
for f in FIBRES:
    ad = min(3e-3 * f.density * f.packing, 1.0 / AREA)
    p(f"  {f.name:10s} Ad_max={ad:.2f} kg/m2  V50 ratio vs 4 kg/m2 aramid ~ (Ad/Ad_ref)^n*U*: "
      + ", ".join(f"n={n}: {v50_ratio(f, A) * (ad / 4.0) ** n:.2f}" for n in (0.25, 0.5, 1.0)))
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
