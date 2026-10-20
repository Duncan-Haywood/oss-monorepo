"""(robofab-motorcurve) The torque-bound rows of robofab-torquebound (no speed limit; 3 arm sizes x jaw cap k = 2 / 5 / none, six printed
parts each) with a speed-dependent joint torque limit tau_max (1 - |qd_i| / w0), w0 = motor no-load speed. Time-optimal solver at n = 1600;
trapezoid on the 14-value ramp grid with 40 extra samples per ramp. Edge = 1 - T_opt / T_trap, on six-part totals."""
import json
import math
import sys
from robofab_motorcurve.geometry import GRIPPER, targets, min_link, best_base
from robofab_motorcurve.model import Arm, G
from robofab_motorcurve import topp, trap

FR = (0.002, 0.005, 0.01, 0.015, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5)
N, RS = 1600, 40
W0S = (None, 20.0, 10.0, 6.0, 4.0)       # rad/s; None = constant limit (robofab-torquebound)
H, LAMBDA, M_GRIP, MU, DENSITY, BRANCH, TAU = 0.100, 1.0, 0.100, 0.5, 1240.0, -1, 5.0
pts = targets()
L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
name = lambda w: "inf" if w is None else f"{w:g}"
print("# robofab-motorcurve: six-part total carry time (s), torque limit tau_max (1 - |qd|/w0), no other speed limit")
print(f"# solver n = {N}; trapezoid ramp samples {RS}; tau_max {TAU} N m; all parameters assumed. edge = 1 - T_opt/T_trap; vpk = peak joint speed (rad/s) of the time-optimal profile, max over parts\n")
out = []
for scale in (1.0, 1.5, 2.5):
    L = round(L0 * scale, 3)
    base = best_base(L * 1000, L * 1000, H * 1000, pts, step=10.0)
    if base is None:
        continue
    arms, qs = {}, {}
    for nm, p in pts.items():
        arm = Arm(L, L, LAMBDA * L, LAMBDA * L, M_GRIP + mass[nm])
        q = [arm.ik(math.hypot(p[k][0] - base[0], p[k][1] - base[1]) / 1000, p[k][2] / 1000 - H, BRANCH) for k in ("pick", "lift")]
        if None not in q:
            arms[nm], qs[nm] = arm, q
    print(f"## L={L} m")
    print(f"{'k':>4s} {'w0':>5s} {'Ttrap':>8s} {'Topt':>8s} {'edge':>7s} {'vpk':>6s} {'parts':>5s}")
    for k in (2.0, 5.0, math.inf):
        per = {}          # w0 -> part -> (T_trap, T_opt, peak joint speed) or None if either method is infeasible
        for w0 in W0S:
            per[w0] = {}
            for nm in arms:
                arm, (qa, qb) = arms[nm], qs[nm]
                cap = None if math.isinf(k) else k * mass[nm] * G / (2 * MU)
                prof = topp.solve(arm, qa, qb, TAU, n=N, jaw_cap=cap, mass=mass[nm], mu=MU, w0=w0)
                bt = trap.best_trap(arm, qa, qb, TAU, mass[nm], cap if cap else 1e9, MU, fracs=FR, ramp_samples=RS, w0=w0)
                per[w0][nm] = None if prof is None or bt is None else (bt[0], prof["T"], topp.peak_joint_speed(qa, qb, prof))
        common = [nm for nm in arms if all(per[w][nm] is not None for w in W0S)]
        dropped = {name(w): [nm for nm in arms if per[w][nm] is None] for w in W0S}
        for w0 in W0S:
            tt = sum(per[w0][nm][0] for nm in common)
            to = sum(per[w0][nm][1] for nm in common)
            vpk = max((per[w0][nm][2] for nm in common), default=0.0)
            row = {"L": L, "k": None if math.isinf(k) else k, "w0": w0, "T_trap": tt, "T_opt": to, "parts": len(common),
                   "edge": 1 - to / tt if tt else None, "vpk": vpk, "infeasible": dropped[name(w0)]}
            out.append(row)
            e = f"{100*row['edge']:6.2f}%" if tt else "   n/a"
            print(f"{'inf' if math.isinf(k) else k:>4} {name(w0):>5s} {tt:8.3f} {to:8.4f} {e} {vpk:6.2f} {len(common):5d}", flush=True)
        print("     infeasible parts by w0:", {w: v for w, v in dropped.items() if v}, "\n")
json.dump(out, open("experiments/results.json", "w"), indent=1)
