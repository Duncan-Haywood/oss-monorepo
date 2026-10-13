"""Moving-grasp holding force: analytic bound m*sqrt((g+a_up)^2+a_side^2)/(2 mu) vs MuJoCo, per part and
grasp axis, at mu = 0.5; plus a contact-time-constant (solref) check at one part. Writes results.{txt,json}."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_graspmove.model import gripper, grasp_options, mass_kg, moving_bound  # noqa: E402
from robofab_graspmove.sim import min_force  # noqa: E402

MU = 0.5
LOADS = [("static", 0, 0), ("up10", 10, 0), ("up20", 20, 0), ("up40", 40, 0),
         ("side10", 0, 10), ("side20", 0, 20), ("side40", 0, 40)]
rows, lines = [], ["part axis load a_up a_side bound_N mujoco_N ratio(mj/bound)"]
for name, boxes in gripper().items():
    if name == "base":
        continue
    for o in grasp_options(boxes, 30.0):
        for tag, au, asd in LOADS:
            b = moving_bound(boxes, MU, au, asd)
            m = min_force(boxes, o["axis"], MU, au, asd)
            r = None if m is None else m / b
            rows.append(dict(part=name, axis="xy"[o["axis"]], load=tag, a_up=au, a_side=asd, mu=MU,
                             bound_N=b, mujoco_N=m, ratio=r))
            lines.append("%-9s %s %-6s %2d %2d %.4f %s %s" % (name, "xy"[o["axis"]], tag, au, asd, b,
                         "None" if m is None else "%.4f" % m, "-" if r is None else "%.2f" % r))
rs = [r["ratio"] for r in rows if r["ratio"] is not None]
lines.append("rows %d, with a result %d, ratio min %.2f median %.2f max %.2f" % (
    len(rows), len(rs), min(rs), sorted(rs)[len(rs) // 2], max(rs)))
lines.append("")
fa = gripper()["finger_a"]
ax = grasp_options(fa)[0]["axis"]
sol = []
lines.append("solref check: finger_a, mu 0.5 (default solref for the table above is 0.0005)")
for au in (10, 40):
    for sr in (0.004, 0.002, 0.001, 0.0005):
        m = min_force(fa, ax, MU, au, 0, solref=sr)
        sol.append(dict(a_up=au, solref=sr, bound_N=moving_bound(fa, MU, au, 0), mujoco_N=m))
        lines.append("up%d bound %.4f solref %g mujoco_N %s" % (au, moving_bound(fa, MU, au, 0), sr,
                     "None (fails at 20 N)" if m is None else "%.4f" % m))
here = os.path.dirname(__file__)
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
json.dump(dict(rows=rows, solref_check=sol), open(os.path.join(here, "results.json"), "w"), indent=1)
print("\n".join(lines))
