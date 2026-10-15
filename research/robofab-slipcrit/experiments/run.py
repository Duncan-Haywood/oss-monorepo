"""Min holding force under three criteria (1 deg tolerance, 5 deg tolerance, extrapolated-rate) for
bars of 20-60 mm, across 8 solver settings (condim 3/4, timeconst 0.002/0.008, impratio 1/10), mu 0.5.
Force grid is geometric 0.05..20 N (13 points); min force = smallest grid force from which all larger pass.
The spread across settings is max/min of the min force. Writes results.txt / results.json."""
import itertools
import json
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "..", "src"))
import mujoco  # noqa: E402
from robofab_slipcrit.crit import min_grid_force, rate_hold, tol_hold  # noqa: E402
from robofab_slipcrit.model import torque_bounds  # noqa: E402
from robofab_slipcrit.sim import run  # noqa: E402

MU = 0.5
FORCES = [round(0.05 * (400 ** (i / 12)), 4) for i in range(13)]  # 0.05 .. 20 N
SETTINGS = list(itertools.product((3, 4), (0.002, 0.008), (1.0, 10.0)))
CRIT = ["tol1", "tol5", "rate"]
out = {"mujoco": mujoco.__version__, "forces": FORCES, "rows": []}
lines = ["MuJoCo %s" % mujoco.__version__,
         "min holding force N (None = fails at 20 N); columns: L_mm condim timeconst impratio tol1 tol5 rate (bracket lower/upper)"]
for L in (20, 30, 40, 60):
    tb = torque_bounds(L, MU)
    for condim, tc, ir in SETTINGS:
        flags = {c: [] for c in CRIT}
        for f in FORCES:
            ts, a, d = run(L, f, MU, condim, timeconst=tc, impratio=ir)
            flags["tol1"].append(tol_hold(ts, a, d, 1.0))
            flags["tol5"].append(tol_hold(ts, a, d, 5.0))
            flags["rate"].append(rate_hold(ts, a, d, L))
        mins = {c: min_grid_force(flags[c], FORCES) for c in CRIT}
        out["rows"].append(dict(L=L, condim=condim, timeconst=tc, impratio=ir, lower=tb["lower"], upper=tb["upper"], **mins))
        lines.append("%2d %d %.3f %4.1f  %s  (%.3f/%.3f)" % (L, condim, tc, ir, "  ".join("%7s" % mins[c] for c in CRIT), tb["lower"], tb["upper"]))
lines += ["", "spread across the 8 settings: L_mm criterion min_N max_N max/min (settings that fail at 20 N counted as 20)"]
out["spread"] = []
for L in (20, 30, 40, 60):
    for c in CRIT:
        v = [(r[c] if r[c] is not None else 20.0) for r in out["rows"] if r["L"] == L]
        out["spread"].append(dict(L=L, crit=c, lo=min(v), hi=max(v), ratio=max(v) / min(v)))
        lines.append("%2d %-5s %7.3f %7.3f %6.1f" % (L, c, min(v), max(v), max(v) / min(v)))
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
json.dump(out, open(os.path.join(here, "results.json"), "w"), indent=1)
print("\n".join(lines))
