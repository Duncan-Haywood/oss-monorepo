"""(robofab-scurvefine) Does the time-optimal solver's node count explain why it is slower than a feasible trapezoid at
wmax = 1 rad/s? Same set-up as run.py, arm size L = 0.12 m, k = inf, wmax = 1 rad/s, six parts; prints the solver's total time
for several node counts n next to the ramp-resolved trapezoid on the fine grid."""
import math
from robofab_scurvefine.geometry import GRIPPER, targets, min_link, best_base
from robofab_scurvefine.model import Arm
from robofab_scurvefine import topp, trap

H, LAMBDA, M_GRIP, MU, DENSITY, BRANCH, TAU, W = 0.100, 1.0, 0.100, 0.5, 1240.0, -1, 5.0, 1.0
FR = (0.002, 0.005, 0.01, 0.015, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5)
pts = targets()
L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
L = round(L0 * 1.5, 3)
base = best_base(L * 1000, L * 1000, H * 1000, pts, step=10.0)
tot = {n: 0.0 for n in (100, 400, 1600, 6400)}
ttrap = 0.0
for nm, p in pts.items():
    arm = Arm(L, L, LAMBDA * L, LAMBDA * L, M_GRIP + mass[nm])
    q = [arm.ik(math.hypot(p[k][0] - base[0], p[k][1] - base[1]) / 1000, p[k][2] / 1000 - H, BRANCH) for k in ("pick", "lift")]
    if None in q:
        continue
    for n in tot:
        tot[n] += topp.solve(arm, q[0], q[1], TAU, n=n, mass=mass[nm], mu=MU, wmax=W)["T"]
    ttrap += trap.best_trap(arm, q[0], q[1], TAU, mass[nm], 1e9, MU, wmax=W, fracs=FR, ramp_samples=40)[0]
print(f"# L={L} m, k=inf, wmax={W} rad/s: six-part total time (s)")
for n, t in tot.items():
    print(f"solver n={n:5d}: {t:.3f}")
print(f"ramp-resolved trapezoid, fine grid: {ttrap:.3f}")
