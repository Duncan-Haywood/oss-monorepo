import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_alufring import ring
from selfrep_rodmodes import modes as m

MATS = ("steel", "aluminium", "hardwood")
out = [f"carriage {m.M_CARRIAGE} kg, rod {ring.L*1000:.0f} mm, zeta {ring.ZETA}, ringing tolerance {ring.TOL*1e6:.0f} um (assumptions)",
       "== max acceleration (m/s^2) inside the ringing tolerance, abrupt step (worst case)",
       "d mm   steel  aluminium  hardwood"]
for d in (8, 10, 12):
    out.append(f"{d:4d}  " + "  ".join(f"{ring.max_accel(mat, d/1000):8.2f}" for mat in MATS))
out += ["", "== smallest diameter (mm) for a target acceleration, abrupt step ('-' = none under 100 mm)",
        "a m/s^2  steel  aluminium  hardwood"]
for a in (1, 2, 3, 5, 10):
    cells = []
    for mat in MATS:
        d = ring.min_diameter(mat, a)
        cells.append("       -" if d is None else f"{1000*d:8.1f}")
    out.append(f"{a:6d}   " + "  ".join(cells))
out += ["", "== same, with the force ramped over 20 ms (ramp shaping)",
        "a m/s^2  steel  aluminium  hardwood"]
for a in (1, 2, 3, 5, 10):
    cells = []
    for mat in MATS:
        d = ring.min_diameter(mat, a, t_ramp=0.020)
        cells.append("       -" if d is None else f"{1000*d:8.1f}")
    out.append(f"{a:6d}   " + "  ".join(cells))
out += ["", "== ring-down to 10% of amplitude at 10 mm (ms)"]
for mat in MATS:
    out.append(f"{mat:10} f={m.frequency(mat, .010, ring.L):5.1f} Hz  settle {1000*ring.settle_time(mat, .010):7.0f} ms")
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
