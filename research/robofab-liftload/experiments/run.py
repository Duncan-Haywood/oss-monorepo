"""A: the six free parts of the toy gripper under lift/tangential acceleration, bound vs MuJoCo (mu 0.5).
B: a 10x10 mm bar held at one end (pad window 10 mm), length 10..60 mm: bound bracket vs MuJoCo, at two
   rotation tolerances. Writes results.txt / results.json."""
import json
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "..", "src"))
from robofab_liftload.model import bar, com_offset_mm, force_bound, mass_kg, torque_bounds  # noqa: E402
from robofab_liftload.parts import gripper, grasp_options  # noqa: E402
from robofab_liftload.sim import holds, min_force  # noqa: E402

MU = 0.5
LOADS = ((0, 0), (10, 0), (20, 0), (0, 10), (0, 20), (20, 20))  # (a_z, a_t) in m/s^2
A, B = [], []
lines = ["A. toy-gripper parts, mu=%.1f: part axis az at bound_N mujoco_N ratio" % MU]
for name, boxes in gripper().items():
    if name == "base":
        continue
    for o in grasp_options(boxes):
        for az, at in LOADS:
            b = force_bound(boxes, MU, az, at)
            m = min_force(boxes, o["axis"], MU, az, at)
            A.append(dict(part=name, axis="xy"[o["axis"]], az=az, at=at, bound_N=b, mujoco_N=m,
                          ratio=None if m is None else m / b, com_offset_mm=com_offset_mm(boxes, o["axis"])))
            lines.append("%-9s %s %2d %2d %.4f %s %s" % (name, "xy"[o["axis"]], az, at, b,
                         "None" if m is None else "%.4f" % m, "-" if m is None else "%.2f" % (m / b)))
rs = sorted(r["ratio"] for r in A if r["ratio"] is not None)
lines.append("A: rows %d (failed at 20 N: %d), ratio min %.2f median %.2f max %.2f; max COM offset %.2f mm" % (
    len(rs), len(A) - len(rs), rs[0], rs[len(rs) // 2], rs[-1], max(r["com_offset_mm"] for r in A)))
lines.append("")
lines.append("B. bar held at one end, gravity only: L_mm mu d_mm lower_N upper_N mujoco_5deg_N mujoco_1deg_N")
for L in (10, 20, 30, 40, 60):
    for mu in (0.3, 0.5, 0.8):
        tb = torque_bounds(L, mu)
        res = {}
        for rot in (5.0, 1.0):
            lo, hi = 0.0, 20.0
            ok = holds(bar(L), 0, hi, mu, win=(1, 0, 10), rot_deg=rot)
            if ok:
                while hi - lo > 0.02 * hi and hi - lo > 1e-4:
                    mid = (lo + hi) / 2
                    if holds(bar(L), 0, mid, mu, win=(1, 0, 10), rot_deg=rot):
                        hi = mid
                    else:
                        lo = mid
            res[rot] = hi if ok else None
        B.append(dict(length_mm=L, mu=mu, d_mm=tb["d_mm"], lower_N=tb["lower"], upper_N=tb["upper"],
                      mujoco_N_rot5=res[5.0], mujoco_N_rot1=res[1.0]))
        lines.append("%2d %.1f %4.1f %.4f %.4f %s %s" % (L, mu, tb["d_mm"], tb["lower"], tb["upper"],
                     *["None" if res[r] is None else "%.4f" % res[r] for r in (5.0, 1.0)]))
inside5 = sum(1 for r in B if r["d_mm"] > 0 and r["mujoco_N_rot5"] is not None and r["lower_N"] <= r["mujoco_N_rot5"] <= r["upper_N"])
below5 = sum(1 for r in B if r["d_mm"] > 0 and r["mujoco_N_rot5"] is not None and r["mujoco_N_rot5"] < r["lower_N"])
inside1 = sum(1 for r in B if r["d_mm"] > 0 and r["mujoco_N_rot1"] is not None and r["lower_N"] <= r["mujoco_N_rot1"] <= r["upper_N"])
below1 = sum(1 for r in B if r["d_mm"] > 0 and r["mujoco_N_rot1"] is not None and r["mujoco_N_rot1"] < r["lower_N"])
n = sum(1 for r in B if r["d_mm"] > 0)
lines.append("B (offset cases %d): 5 deg tolerance: %d inside bracket, %d below lower bound; 1 deg: %d inside, %d below" % (n, inside5, below5, inside1, below1))
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
json.dump(dict(A=A, B=B), open(os.path.join(here, "results.json"), "w"), indent=1)
print("\n".join(lines))
