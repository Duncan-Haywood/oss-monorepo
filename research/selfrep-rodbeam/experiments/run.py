import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_rodbeam import beam as b

P = 5.0  # N per rod at mid-span (assumed: ~0.5 kg carried by each rod)
out = [f"assumed mid-span load per rod P = {P} N; rods (length m, count) = {b.RODS}",
       "== deflection at the standard 8 mm diameter (longest rod, 420 mm)"]
L = 0.420
ds = {}
for m in b.MATERIALS:
    ds[m] = b.deflection(m, b.D_STD, L, P)
    out.append(f"{m:12} {1000*ds[m]:8.3f} mm   x{ds[m]/ds['steel']:5.1f} steel   stress {b.stress(b.D_STD, L, P)/1e6:5.1f} MPa "
               f"(allowable {b.MATERIALS[m][2]/1e6:.0f})   rod-set mass {b.rod_set_mass_g(m, b.D_STD):6.0f} g")
out += ["", "== minimum diameter (mm) to hold a mid-span deflection spec, longest rod; '*' = above 12 mm standard-holder limit"]
specs = (0.05, 0.1, 0.2, 0.5, 1.0, 2.0)
out.append("spec mm   " + "  ".join(f"{m:>11}" for m in b.MATERIALS))
for s in specs:
    row = []
    for m in b.MATERIALS:
        d = b.min_diameter(m, s / 1000, L, P) * 1000
        row.append(f"{d:10.1f}{'*' if d > 12 else ' '}")
    out.append(f"{s:6.2f}    " + "  ".join(row))
out += ["", "== hardwood rod: sensitivity of the diameter needed to match the 8 mm steel rod's deflection, to E"]
d_steel = b.deflection("steel", b.D_STD, L, P)
for E in (6e9, 8e9, 10e9, 12e9, 14e9):
    out.append(f"E = {E/1e9:4.0f} GPa -> d = {1000*b.min_diameter('hardwood', d_steel, L, P, E=E):5.1f} mm")
out += ["", "== mass closure of the all-substitutions redesign with wooden rods sized for a deflection spec "
        "(printer+cnc+laser shop; the assumed 30 g/rod of selfrep-redesign for comparison)"]
procs = {"fdm", "cnc", "laser"}
import selfrep_rodbeam.beam as bb
from selfrep_redesign import design as rd
allc = tuple(range(len(rd.SUBS)))
out.append(f"selfrep-redesign as published (8 mm, 30 g/rod): mass closure {100*rd.closure_of(rd.design(allc), procs, 'mass'):.1f}%")
for s in specs:
    d = b.min_diameter("hardwood", s / 1000, L, P)
    out.append(f"spec {s:4.2f} mm: dowel {1000*d:5.1f} mm, {b.rod_set_mass_g('hardwood', d)/6:6.1f} g/rod, "
               f"mass closure {100*b.wood_design_closure(d, procs):.1f}%")
out.append(f"8 mm hardwood from geometry: {b.rod_set_mass_g('hardwood', .008)/6:.1f} g/rod, mass closure {100*b.wood_design_closure(.008, procs):.1f}%")
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
