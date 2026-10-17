"""Does MuJoCo's `refsafe` flag explain the timestep clamp in the moving-grasp jaw test?
Same cover-part test as robofab-solreftimestep (copied), run with refsafe enabled and disabled over
solref x timestep at 400 and 800 m/s^2. Ratio = minimum holding force / analytic bound; 'none' = no
force up to 60 N holds. Writes results.{txt,json}."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_solrefsafe.model import gripper, grasp_options, moving_bound  # noqa: E402
from robofab_solrefsafe import sim  # noqa: E402
from robofab_solrefsafe.sim import min_force  # noqa: E402

MU = 0.5
SR = [5e-4, 3e-4, 2e-4, 1e-4]
DT = [4e-4, 2e-4, 1e-4, 5e-5]
cov = gripper()["cover"]
o = grasp_options(cov, 30.0)[0]
rows, lines = [], []
for a in [400, 800]:
    b = moving_bound(cov, MU, a, 0)
    for rs_flag in (True, False):
        lines.append("cover, a_up=%d, bound %.4f N, refsafe %s; ratio mujoco/bound; rows solref ms, columns timestep ms %s"
                     % (a, b, "on" if rs_flag else "off", " ".join("%g" % (d * 1e3) for d in DT)))
        for sr in SR:
            rs = []
            for dt in DT:
                u0 = sim.UNSTABLE[0]
                m = min_force(cov, o["axis"], MU, a, 0, hi=60.0, solref=sr, dt=dt, refsafe=rs_flag)
                r = None if m is None else m / b
                rows.append(dict(part="cover", a_up=a, refsafe=rs_flag, solref=sr, dt=dt, mu=MU, bound_N=b, mujoco_N=m, ratio=r, unstable_runs=sim.UNSTABLE[0] - u0))
                rs.append(("  none" if r is None else "%6.2f" % r) + ("*" if sim.UNSTABLE[0] > u0 else " "))
            lines.append("%4g | %s" % (sr * 1e3, " ".join(rs)))
            print(lines[-1], flush=True)
        lines.append("")
here = os.path.dirname(__file__)
nh = {k: sum(1 for r in rows if r["refsafe"] == k and r["ratio"] is not None) for k in (True, False)}
lines.append("* = at least one run in that cell had a bad-acceleration (unstable) warning (counted as not held; %d such runs in total)" % sim.UNSTABLE[0])
lines.append("cells holding: refsafe on %d of 32, off %d of 32" % (nh[True], nh[False]))
print(lines[-1])
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
json.dump(dict(rows=rows), open(os.path.join(here, "results.json"), "w"), indent=1)
