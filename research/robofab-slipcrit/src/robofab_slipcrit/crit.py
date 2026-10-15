"""Holding criteria applied to a creeping bar's simulated trajectory.

A trajectory is (ts, angle_deg, drop_mm) sampled every 0.05 s over a 1 s run (see `sim.run`).
- `tol_hold`: the rotation-tolerance test used in robofab-liftload: angle at 0.5 s below `tol_deg`
  and drop at 0.5 s below 2 mm.
- `rate_hold`: the rate test. The late rotation rate and drop rate (least-squares slope over the last
  0.4 s) are extrapolated over a task time `T` (the time the gripper must hold). The bar holds if the
  far end would move less than `tip_mm` and the centre of mass would drop less than `tip_mm`.
"""
import math

from .sim import late_rate

PAD_CENTRE_MM = 5.0  # the 10 mm pad window is centred 5 mm from the bar's gripped end


def tol_hold(ts, ang, drop, tol_deg):
    i = min(range(len(ts)), key=lambda k: abs(ts[k] - 0.5))
    return abs(ang[i]) < tol_deg and abs(drop[i]) < 2.0


def rate_hold(ts, ang, drop, length_mm, task_s=3.0, tip_mm=2.0):
    w = math.radians(late_rate(ts, ang))
    tip = abs(w) * task_s * (length_mm - PAD_CENTRE_MM)
    dr = abs(late_rate(ts, drop)) * task_s
    return tip < tip_mm and dr < tip_mm


def min_grid_force(flags, forces):
    """Smallest grid force from which every larger grid force also holds; None if the largest fails."""
    best = None
    for f, ok in sorted(zip(forces, flags), reverse=True):
        if ok:
            best = f
        else:
            break
    return best
