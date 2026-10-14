import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_rodmodes import modes as m
from selfrep_rodbeam import beam as rb

L = m.L_LONG
out = [f"assumed carriage mass M = {m.M_CARRIAGE} kg; longest rod L = {L} m; Rayleigh effective rod mass 17/35",
       "== first natural frequency (Hz) at the standard 8 mm diameter"]
for mat in m.MATERIALS:
    out.append(f"{mat:12} {m.frequency(mat, rb.D_STD, L):7.1f} Hz   rod-only {m.rod_only_frequency(mat, rb.D_STD, L):7.1f} Hz")
out += ["", "== minimum diameter (mm) to reach a target frequency; '*' = above the 12 mm standard-holder limit"]
for M in (0.1, 0.3, 1.0):
    out.append(f"-- carriage mass {M} kg")
    out.append("target Hz " + "  ".join(f"{k:>11}" for k in m.MATERIALS))
    for f in (20, 40, 60, 100, 150):
        row = []
        for mat in m.MATERIALS:
            d = m.min_diameter(mat, f, L, M) * 1000
            row.append(f"{d:10.1f}{'*' if d > 12 else ' '}")
        out.append(f"{f:8}  " + "  ".join(row))
out += ["", "== hardwood dowel diameter / steel rod diameter at equal frequency (0.3 kg carriage), vs the sag-matching ratio "
        f"{(200/10)**.25:.2f} of selfrep-rodbeam"]
for f in (20, 40, 60, 100, 150):
    ds, dw = m.min_diameter("steel", f, L), m.min_diameter("hardwood", f, L)
    out.append(f"{f:4} Hz: steel {1000*ds:5.1f} mm, hardwood {1000*dw:5.1f} mm, ratio {dw/ds:5.2f}")
f8 = m.frequency("steel", rb.D_STD, L)
dw = m.min_diameter("hardwood", f8, L)
out += ["", f"== matching the 8 mm steel rod's own frequency ({f8:.1f} Hz): hardwood needs {1000*dw:.1f} mm "
        f"(selfrep-rodbeam's sag-matching: {1000*rb.min_diameter('hardwood', rb.deflection('steel', rb.D_STD, L, 5.0), L, 5.0):.1f} mm)",
        f"   hardwood at 8 mm reaches {m.frequency('hardwood', rb.D_STD, L):.1f} Hz = {m.frequency('hardwood', rb.D_STD, L)/f8:.2f} of steel"]
procs = {"fdm", "cnc", "laser"}
out += ["", "== mass closure (printer+cnc+laser, all substitutions) with wooden rods sized for a frequency target"]
for f in (20, 30, 40, 60):
    d = m.min_diameter("hardwood", f, L)
    out.append(f"{f:3} Hz: dowel {1000*d:5.1f} mm, mass closure {100*rb.wood_design_closure(d, procs):.1f}%")
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
