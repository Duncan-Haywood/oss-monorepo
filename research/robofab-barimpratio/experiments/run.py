"""A: creep rate of a bar held at one end vs friction-cone softness (impratio) and force.
B: minimum holding force of that bar vs impratio at two rotation tolerances, against the uniform-pressure
   bracket from robofab-liftload and a point-contact bound using the contact layout MuJoCo reports.
Writes results.txt / results.json. About 3 minutes."""
import json
import os
import sys

import mujoco
import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "..", "src"))
from robofab_barimpratio.model import bar, point_contact_bound, torque_bounds  # noqa: E402
from robofab_barimpratio.sim import mjcf, min_force  # noqa: E402

WIN = (1, 0, 10)
IMPS = (1, 3, 10, 30, 100, 1000)


def creep_rate(length, mu, force, impratio, t_end=1.0):
    """Rotation rate (deg/s) of the bar over the last half of a 1 s run."""
    m = mujoco.MjModel.from_xml_string(mjcf(bar(length), 0, mu, 0, 0, win=WIN, impratio=impratio))
    d = mujoco.MjData(m)
    d.ctrl[:] = force
    mujoco.mj_forward(m, d)
    q0 = d.xquat[1].copy()
    n = int(t_end / m.opt.timestep)
    ang = {}
    for i in range(n + 1):
        if i in (n // 2, n):
            ang[i] = np.degrees(2 * np.arccos(min(1.0, abs(float(np.dot(q0, d.xquat[1]))))))
        mujoco.mj_step(m, d)
    return (ang[n] - ang[n // 2]) / (t_end / 2)


def contact_layout(length, mu, force, impratio):
    """(y, z) mm of the bar's contacts with the low pad after 0.3 s, and the count over both pads."""
    m = mujoco.MjModel.from_xml_string(mjcf(bar(length), 0, mu, 0, 0, win=WIN, impratio=impratio))
    d = mujoco.MjData(m)
    d.ctrl[:] = force
    for _ in range(int(0.3 / m.opt.timestep)):
        mujoco.mj_step(m, d)
    pts = sorted({(round(float(c.pos[1]) * 1e3), round(float(c.pos[2]) * 1e3)) for c in d.contact[:d.ncon]
                  if abs(c.pos[0]) < 1e-3})
    return pts, d.ncon


lines = ["A. creep rate (deg/s, last 0.5 s of 1 s), bar 10x10x40 mm, mu 0.5, columns = force 0.3 / 1 / 3 N"]
A = []
for imp in IMPS:
    r = [creep_rate(40, 0.5, f, imp) for f in (0.3, 1.0, 3.0)]
    A.append(dict(impratio=imp, force_N=[0.3, 1.0, 3.0], rate_deg_s=r))
    lines.append("impratio %5g: %s" % (imp, " ".join("%8.3f" % v for v in r)))

lay, nc = contact_layout(40, 0.5, 1.0, 100)
lines.append("")
lines.append("contact points on the low pad (y, z mm) at 1 N: %s; %d contacts over both pads" % (lay, nc))

lines.append("")
lines.append("B. min holding force (N): L_mm mu | uniform lower, upper | point-contact corners, MuJoCo layout | "
             "impratio -> (5 deg, 1 deg) tolerance")
B = []
for L in (20, 30, 40, 60):
    for mu in (0.3, 0.5, 0.8):
        tb = torque_bounds(L, mu)
        pc4 = point_contact_bound(L, mu)
        pcm = point_contact_bound(L, mu, points=lay)
        row = dict(length_mm=L, mu=mu, lower_N=tb["lower"], upper_N=tb["upper"], corners_N=pc4, layout_N=pcm, mujoco={})
        cells = []
        for imp in (1, 10, 100, 1000):
            r5 = min_force(bar(L), 0, mu, win=WIN, impratio=imp, rot_deg=5.0)
            r1 = min_force(bar(L), 0, mu, win=WIN, impratio=imp, rot_deg=1.0)
            row["mujoco"][str(imp)] = dict(rot5=r5, rot1=r1)
            cells.append("%g->(%s, %s)" % (imp, *["None" if v is None else "%.3f" % v for v in (r5, r1)]))
        B.append(row)
        lines.append("%2d %.1f | %.3f %.3f | %.3f %.3f | %s" % (L, mu, tb["lower"], tb["upper"], pc4, pcm, "  ".join(cells)))


def stat(vals):
    v = sorted(vals)
    return "min %.2f median %.2f max %.2f (n=%d)" % (v[0], v[len(v) // 2], v[-1], len(v))


lines.append("")
for imp in ("1", "10", "100", "1000"):
    ok1 = [r for r in B if r["mujoco"][imp]["rot1"] is not None]
    lines.append("impratio %s: 1 deg holds in %d/12 cases" % (imp, len(ok1)))
    if ok1:
        lines.append("   MuJoCo(1 deg)/uniform lower: " + stat([r["mujoco"][imp]["rot1"] / r["lower_N"] for r in ok1]))
        lines.append("   MuJoCo(1 deg)/point-contact (MuJoCo layout): " + stat([r["mujoco"][imp]["rot1"] / r["layout_N"] for r in ok1]))
    both = [r for r in B if r["mujoco"][imp]["rot1"] is not None and r["mujoco"][imp]["rot5"] is not None]
    if both:
        lines.append("   1 deg force / 5 deg force: " + stat([r["mujoco"][imp]["rot1"] / r["mujoco"][imp]["rot5"] for r in both]))
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
json.dump(dict(A=A, layout=lay, B=B), open(os.path.join(here, "results.json"), "w"), indent=1)
print("\n".join(lines))
