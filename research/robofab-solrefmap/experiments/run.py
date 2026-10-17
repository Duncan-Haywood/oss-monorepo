"""Contact-setting map for the moving-grasp jaw-force test (robofab-graspfast set-up, copied).
For each part and upward acceleration, the minimum holding force found in MuJoCo at four
(solref, timestep) pairs, as a ratio to the analytic bound. Writes results.{txt,json}."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_solrefmap.model import gripper, grasp_options, moving_bound  # noqa: E402
from robofab_solrefmap.sim import min_force  # noqa: E402

MU = 0.5
ACCS = [100, 400, 800]
SETTINGS = [(5e-4, 2e-4), (2e-4, 1e-4), (1e-4, 5e-5), (5e-5, 2.5e-5)]   # (solref s, timestep s)
rows = []
lines = ["part axis a_up bound_N | ratio mujoco/bound at (solref ms, dt ms): " +
         " ".join("(%g,%g)" % (s * 1e3, d * 1e3) for s, d in SETTINGS)]
for name, boxes in gripper().items():
    o = grasp_options(boxes, 30.0)[0]
    for a in ACCS:
        b = moving_bound(boxes, MU, a, 0)
        rs = []
        for sr, dt in SETTINGS:
            m = min_force(boxes, o["axis"], MU, a, 0, hi=60.0, solref=sr, dt=dt)
            r = None if m is None else m / b
            rows.append(dict(part=name, axis="xy"[o["axis"]], a_up=a, solref=sr, dt=dt, mu=MU, bound_N=b, mujoco_N=m, ratio=r))
            rs.append("  none" if r is None else "%6.2f" % r)
        lines.append("%-9s %s %3d %.4f | %s" % (name, "xy"[o["axis"]], a, b, " ".join(rs)))
        print(lines[-1], flush=True)

SR = [5e-4, 4e-4, 3e-4, 2.5e-4, 2e-4]
AS = [200, 300, 400, 600, 800]
cov = gripper()["cover"]
o = grasp_options(cov, 30.0)[0]
lines.append("")
lines.append("boundary scan: cover, up, timestep 0.1 ms; ratio mujoco/bound (none = no force up to 60 N holds)")
lines.append("a_up | solref ms: " + " ".join("%g" % (x * 1e3) for x in SR))
for a in AS:
    b = moving_bound(cov, MU, a, 0)
    rs = []
    for sr in SR:
        m = min_force(cov, o["axis"], MU, a, 0, hi=60.0, solref=sr, dt=1e-4)
        r = None if m is None else m / b
        rows.append(dict(part="cover", scan=True, axis="xy"[o["axis"]], a_up=a, solref=sr, dt=1e-4, mu=MU, bound_N=b, mujoco_N=m, ratio=r))
        rs.append("  none" if r is None else "%6.2f" % r)
    lines.append("%3d | %s" % (a, " ".join(rs)))
    print(lines[-1], flush=True)
here = os.path.dirname(__file__)
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
json.dump(dict(rows=rows), open(os.path.join(here, "results.json"), "w"), indent=1)
