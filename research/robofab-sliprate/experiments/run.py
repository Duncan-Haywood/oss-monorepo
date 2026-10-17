"""Creep of a bar held at one end by two pads: rotation rate vs jaw force, contact model and solver settings.

A: length x force grid, mu 0.5, condim 3 vs 4 (torsional friction 0.005 m): late rotation rate (deg/s), drop rate (mm/s).
B: L=40 mm, 1.2 N, rotation rate vs solref time constant and impratio, condim 3 and 4.
C: L=40 mm, condim 4, creep over a longer run (3 s) at the force that is 4x the torque bracket's upper bound.
Writes results.txt / results.json."""
import json
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "..", "src"))
import mujoco  # noqa: E402
from robofab_sliprate.model import torque_bounds  # noqa: E402
from robofab_sliprate.sim import late_rate, run  # noqa: E402

MU = 0.5
out = {"mujoco": mujoco.__version__, "A": [], "B": [], "C": []}
L_ = ["MuJoCo %s" % mujoco.__version__, "A. mu=%.1f: L_mm condim force_N rate_deg_s drop_rate_mm_s (bracket lower/upper N)" % MU]
for L in (20, 30, 40, 60):
    tb = torque_bounds(L, MU)
    for condim in (3, 4):
        for f in (0.1, 0.3, 1.0, 3.0, 10.0, 20.0):
            ts, a, d = run(L, f, MU, condim)
            r = late_rate(ts, a)
            dr = late_rate(ts, d)
            out["A"].append(dict(L=L, condim=condim, force=f, rate=r, drop_rate=dr, lower=tb["lower"], upper=tb["upper"]))
            L_.append("%2d %d %5.1f %8.3f %8.3f  (%.3f/%.3f)" % (L, condim, f, r, dr, tb["lower"], tb["upper"]))
L_.append("")
L_.append("B. L=40 mm, 1.2 N: condim timeconst impratio rate_deg_s")
for condim in (3, 4):
    for tc in (0.002, 0.004, 0.008):
        for ir in (1.0, 10.0):
            ts, a, _ = run(40, 1.2, MU, condim, timeconst=tc, impratio=ir)
            r = late_rate(ts, a)
            out["B"].append(dict(condim=condim, timeconst=tc, impratio=ir, rate=r))
            L_.append("%d %.3f %4.1f %8.3f" % (condim, tc, ir, r))
L_.append("")
tb = torque_bounds(40, MU)
f = 4 * tb["upper"]
ts, a, _ = run(40, f, MU, 4, t_end=3.0, every=0.5)
out["C"] = dict(force=f, t=ts, angle=a)
L_.append("C. L=40 mm, condim 4, %.3f N (4x bracket upper): angle_deg at t=%s" % (f, ", ".join("%.1f" % t for t in ts)))
L_.append(", ".join("%.2f" % x for x in a))
open(os.path.join(here, "results.txt"), "w").write("\n".join(L_) + "\n")
json.dump(out, open(os.path.join(here, "results.json"), "w"), indent=1)
print("\n".join(L_))
