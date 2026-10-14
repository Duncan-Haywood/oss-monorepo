"""Full (solref x timestep) grid for the moving-grasp jaw-force test (robofab-solrefmap set-up, copied).
Cover part, upward accelerations 400 and 800 m/s^2. Ratio of minimum holding force in MuJoCo
to the analytic bound; 'none' = no force up to 60 N holds. Writes results.{txt,json}."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_solreftimestep.model import gripper, grasp_options, moving_bound  # noqa: E402
from robofab_solreftimestep.sim import min_force  # noqa: E402

MU = 0.5
SR = [5e-4, 3e-4, 2e-4]
DT = [4e-4, 2e-4, 1e-4, 5e-5]
cov = gripper()["cover"]
o = grasp_options(cov, 30.0)[0]
rows, lines = [], []
for a in [400, 800]:
    b = moving_bound(cov, MU, a, 0)
    lines.append("cover, a_up=%d, bound %.4f N; ratio mujoco/bound; rows solref ms, columns timestep ms %s"
                 % (a, b, " ".join("%g" % (d * 1e3) for d in DT)))
    for sr in SR:
        rs = []
        for dt in DT:
            m = min_force(cov, o["axis"], MU, a, 0, hi=60.0, solref=sr, dt=dt)
            r = None if m is None else m / b
            rows.append(dict(part="cover", a_up=a, solref=sr, dt=dt, mu=MU, bound_N=b, mujoco_N=m, ratio=r))
            rs.append("  none" if r is None else "%6.2f" % r)
        lines.append("%4g | %s" % (sr * 1e3, " ".join(rs)))
        print(lines[-1], flush=True)
here = os.path.dirname(__file__)
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
json.dump(dict(rows=rows), open(os.path.join(here, "results.json"), "w"), indent=1)

# Second scan: finer timestep ladder at fixed solref, plus the effective time constant. MuJoCo's default
# `refsafe` flag raises solref to 2*timestep when it is smaller, so effective = max(solref, 2*dt).
DT2 = [4e-4, 2e-4, 1.5e-4, 1e-4, 7e-5, 5e-5, 3.5e-5, 2.5e-5]
lines.append("")
lines.append("timestep ladder, cover; columns timestep ms %s; second line effective solref ms = max(solref, 2*dt)"
             % " ".join("%g" % (d * 1e3) for d in DT2))
for a, sr in [(400, 3e-4), (800, 2e-4), (800, 1e-4)]:
    b = moving_bound(cov, MU, a, 0)
    rs = []
    for dt in DT2:
        m = min_force(cov, o["axis"], MU, a, 0, hi=60.0, solref=sr, dt=dt)
        r = None if m is None else m / b
        rows.append(dict(part="cover", ladder=True, a_up=a, solref=sr, dt=dt, mu=MU, bound_N=b, mujoco_N=m, ratio=r))
        rs.append("  none" if r is None else "%6.2f" % r)
    lines.append("a=%d solref %g ms | %s" % (a, sr * 1e3, " ".join(rs)))
    lines.append("  effective ms     | %s" % " ".join("%6.2f" % (max(sr, 2 * d) * 1e3) for d in DT2))
    print("\n".join(lines[-2:]), flush=True)
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
json.dump(dict(rows=rows), open(os.path.join(here, "results.json"), "w"), indent=1)
