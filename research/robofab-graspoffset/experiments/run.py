"""Off-centre centre of mass: minimum per-jaw force vs offset d, for a ball pad and a flat pad.
20 mm PLA-like cube, mu = 0.5, assumed torsional coefficient mu_t = 2 mm for the ball pad.
Compares MuJoCo with the analytic bounds in model.py. Writes results.{txt,json}."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_graspoffset.model import ball_required_force, flat_required_force, mass_kg  # noqa: E402
from robofab_graspoffset.sim import contact_count, min_force  # noqa: E402

L, MU, MUT = 20.0, 0.5, 0.002
rows, lines = [], ["cube %g mm, mass %.2f g, mu %g, mu_t(ball) %g m; slip-only force m*g/(2mu) = %.4f N" % (
    L, mass_kg(L) * 1e3, MU, MUT, mass_kg(L) * 9.81 / (2 * MU))]
lines.append("contacts at rest (part-pad): flat %d, ball %d" % (contact_count(L, 1.0, MU, "flat"), contact_count(L, 1.0, MU, "ball")))
lines.append("d_mm | ball: bound_N mujoco_N ratio | flat: lower(best split) upper(equal split) mujoco_N")
for d in (0, 2, 4, 6, 8, 10, 15, 20):
    bb = ball_required_force(L, d, MU, MUT)
    bm = min_force(L, d, MU, MUT, "ball")
    fl = flat_required_force(L, d, MU, "best")
    fu = flat_required_force(L, d, MU, "equal")
    fm = min_force(L, d, MU, MUT, "flat")
    rows.append(dict(d_mm=d, ball_bound_N=bb, ball_mujoco_N=bm, flat_lower_N=fl, flat_upper_N=fu, flat_mujoco_N=fm))
    lines.append("%4g | %.4f %s %s | %.4f %.4f %s" % (d, bb, "None" if bm is None else "%.4f" % bm,
                 "-" if bm is None else "%.3f" % (bm / bb), fl, fu, "None" if fm is None else "%.4f" % fm))
rb = [r["ball_mujoco_N"] / r["ball_bound_N"] for r in rows if r["ball_mujoco_N"]]
inside = [r["flat_lower_N"] * 0.98 <= r["flat_mujoco_N"] <= r["flat_upper_N"] * 1.02 for r in rows if r["flat_mujoco_N"]]
lines.append("ball ratio min %.3f max %.3f; flat MuJoCo inside [lower, upper] (2%% tolerance) in %d of %d rows" % (min(rb), max(rb), sum(inside), len(inside)))
# sensitivity to the rotation tolerance (the translation tolerance stays 2 mm)
import robofab_graspoffset.sim as sim  # noqa: E402
lines.append("rotation-tolerance check at d = 10 mm (rows above use 3 deg): pad rot_deg min_force_N")
for pad in ("ball", "flat"):
    for rot in (1.0, 3.0, 10.0):
        hi, lo = 5.0, 0.0
        while hi - lo > 0.02 * hi:
            mid = (hi + lo) / 2
            if sim.holds(L, 10, mid, MU, MUT, pad, rot_deg=rot):
                hi = mid
            else:
                lo = mid
        lines.append("%s %g %.4f" % (pad, rot, hi))
here = os.path.dirname(__file__)
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
json.dump(rows, open(os.path.join(here, "results.json"), "w"), indent=1)
print("\n".join(lines))
