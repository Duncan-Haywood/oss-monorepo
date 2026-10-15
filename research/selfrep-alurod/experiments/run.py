import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_alurod import alu
from selfrep_rodbeam import beam as b

P, L = 5.0, 0.420
out = [f"assumed mid-span load P = {P} N, longest rod {L*1000:.0f} mm, holder limit {b.D_MAX_STD*1000:.0f} mm (all assumptions of selfrep-rodbeam)",
       "== diameter, fit, rod-set mass, mass closure and imported rod stock for a deflection spec "
       "(all seven redesign substitutions, printer+router+laser shop)"]
out.append("spec mm  material     d mm  fits  g/rod  mass-closure  stock-to-import g  vitamin g")
for s in (0.05, 0.1, 0.2, 0.5, 1.0, 2.0):
    for m in ("hardwood", "aluminium"):
        d = b.min_diameter(m, s / 1000, L, P)
        parts = alu.design_with(m, d)
        out.append(f"{s:6.2f}   {m:10} {1000*d:6.1f}  {'yes' if alu.fits(d) else 'NO ':3}  {b.rod_set_mass_g(m, d)/6:6.1f}  "
                   f"{100*alu.closure(m, d):8.1f}%     {alu.imported_stock_g(parts):10.0f}      {alu.vitamin_mass_g(parts):7.0f}")
out += ["", "== same table with the steel-rod baseline (rods stay a vitamin; no substitution of the rod line)"]
chosen = tuple(i for i in range(len(alu.rd.SUBS)) if i != 4)
parts = alu.rd.design(chosen)
out.append(f"steel rods: mass closure {100*alu.rd.closure_of(parts, alu.PROCS, 'mass'):.1f}%, stock-to-import {alu.imported_stock_g(parts):.0f} g, "
           f"vitamin {alu.vitamin_mass_g(parts):.0f} g")
ds = b.deflection("steel", b.D_STD, L, P)
out += ["", f"steel 8 mm sag {1000*ds:.3f} mm; matching it needs aluminium d = {1000*b.min_diameter('aluminium', ds, L, P):.1f} mm "
        f"(fits: {alu.fits(b.min_diameter('aluminium', ds, L, P))}) and hardwood d = {1000*b.min_diameter('hardwood', ds, L, P):.1f} mm "
        f"(fits: {alu.fits(b.min_diameter('hardwood', ds, L, P))})"]
out += ["", "== sensitivity: aluminium diameter to match 8 mm steel vs aluminium modulus (alloys vary little, ~68-72 GPa)"]
for E in (68e9, 69e9, 72e9):
    out.append(f"E = {E/1e9:3.0f} GPa -> d = {1000*b.min_diameter('aluminium', ds, L, P, E=E):5.2f} mm")
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
