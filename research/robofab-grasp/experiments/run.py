"""For every non-base part of the toy gripper and each feasible grasp axis: analytic friction bound vs
the MuJoCo minimum holding force, at three friction coefficients. Writes results.txt / results.json."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_grasp.model import contact_area, force_bound, gripper, grasp_options, mass_kg  # noqa: E402
from robofab_grasp.sim import min_force  # noqa: E402

MUS = (0.3, 0.5, 0.8)
JAW = 30.0
rows = []
parts = gripper()
lines = ["part axis width_mm mass_g mu bound_N mujoco_N ratio(mj/bound)"]
for name, boxes in parts.items():
    if name == "base":
        continue
    opts = grasp_options(boxes, JAW)
    if not opts:
        lines.append("%s: no feasible grasp with a %.0f mm jaw opening" % (name, JAW))
    for o in opts:
        for mu in MUS:
            b = force_bound(boxes, mu)
            m = min_force(boxes, o["axis"], mu)
            r = None if m is None else m / b
            rows.append(dict(part=name, axis="xy"[o["axis"]], width_mm=o["width"], mass_g=mass_kg(boxes) * 1e3,
                             mu=mu, bound_N=b, mujoco_N=m, ratio=r))
            lines.append("%-9s %s %5.1f %5.2f %.1f %.4f %s %s" % (
                name, "xy"[o["axis"]], o["width"], mass_kg(boxes) * 1e3, mu, b,
                "None" if m is None else "%.4f" % m, "-" if r is None else "%.2f" % r))
rs = [r["ratio"] for r in rows if r["ratio"] is not None]
lines.append("rows %d, ratio min %.2f median %.2f max %.2f" % (len(rs), min(rs), sorted(rs)[len(rs) // 2], max(rs)))
here = os.path.dirname(__file__)
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
json.dump(rows, open(os.path.join(here, "results.json"), "w"), indent=1)
print("\n".join(lines))
