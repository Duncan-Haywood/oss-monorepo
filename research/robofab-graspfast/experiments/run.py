"""Moving-grasp holding force at arm-scale accelerations: analytic bound vs MuJoCo.
Part list and set-up copied from robofab-graspmove; accelerations extend to 800 m/s^2 (robofab-armaccel range).
Writes results.{txt,json}."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_graspfast.model import gripper, grasp_options, moving_bound  # noqa: E402
from robofab_graspfast.sim import min_force  # noqa: E402

MU = 0.5
PARTS = ["link", "finger_a", "cover"]
ACCS = [40, 100, 200, 400, 800]
HEAD = "part axis load a_up a_side t_acc bound_N mujoco_N ratio(mj/bound)"
lines = []
rows = []


def run(name, boxes, o, tag, au, asd, t_acc=0.05, solref=0.0005, dt=0.0002, hi=60.0):
    b = moving_bound(boxes, MU, au, asd)
    m = min_force(boxes, o["axis"], MU, au, asd, hi=hi, solref=solref, t_acc=t_acc, dt=dt)
    r = None if m is None else m / b
    rows.append(dict(part=name, axis="xy"[o["axis"]], load=tag, a_up=au, a_side=asd, t_acc=t_acc, solref=solref, dt=dt,
                     mu=MU, bound_N=b, mujoco_N=m, ratio=r))
    lines.append("%-9s %s %-7s %3d %3d %.3f %.4f %s %s" % (name, "xy"[o["axis"]], tag, au, asd, t_acc, b,
                 "None" if m is None else "%.4f" % m, "-" if r is None else "%.2f" % r))


def table(label, **kw):
    lines.append(label)
    lines.append(HEAD)
    start = len(rows)
    for name in PARTS:
        boxes = gripper()[name]
        o = grasp_options(boxes, 30.0)[0]
        run(name, boxes, o, "static", 0, 0, **kw)
        for a in ACCS:
            run(name, boxes, o, "up%d" % a, a, 0, **kw)
            run(name, boxes, o, "side%d" % a, 0, a, **kw)
        run(name, boxes, o, "mix", 200, 100, **kw)
        run(name, boxes, o, "mix", 100, 200, **kw)
    rs = [r["ratio"] for r in rows[start:] if r["ratio"] is not None]
    lines.append("rows %d, with a result %d, ratio min %.2f median %.2f max %.2f" % (
        len(rows) - start, len(rs), min(rs), sorted(rs)[len(rs) // 2], max(rs)))
    lines.append("")


table("TABLE A: graspmove settings (dt 0.2 ms, solref 0.5 ms), t_acc 0.05 s")
table("TABLE B: fine settings (dt 0.05 ms, solref 0.1 ms), t_acc 0.05 s", solref=0.0001, dt=0.00005)
cov = gripper()["cover"]
o = grasp_options(cov, 30.0)[0]
lines.append("settings sweep: cover, up 400 m/s^2, t_acc 0.05 s")
lines.append(HEAD + " solref dt")
for dt, sr in ((0.0002, 0.0005), (0.0001, 0.0005), (0.0001, 0.0002), (0.00005, 0.0002), (0.00005, 0.0001), (0.000025, 0.00005)):
    run("cover", cov, o, "up400", 400, 0, solref=sr, dt=dt)
    lines[-1] += " %g %g" % (sr, dt)
lines.append("")
lines.append("duration check (fine settings): cover, side 400 m/s^2")
lines.append(HEAD)
for t in (0.02, 0.05, 0.10, 0.15):
    run("cover", cov, o, "side400", 0, 400, t_acc=t, solref=0.0001, dt=0.00005)
here = os.path.dirname(__file__)
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
json.dump(dict(rows=rows), open(os.path.join(here, "results.json"), "w"), indent=1)
print("\n".join(lines))
