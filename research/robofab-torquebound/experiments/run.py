"""(robofab-torquebound) The torque- and jaw-bound rows of robofab-scurve (no speed limit; 3 arm sizes x jaw cap k = 2 / 5 / none,
six printed parts each): time-optimal solver at node counts n, and the trapezoid at ramp sampling 40 and 160 extra samples per ramp,
on the fine 14-value ramp-fraction grid of robofab-toppconv. Edge = 1 - T_opt / T_trap."""
import json
import math
from robofab_torquebound.geometry import GRIPPER, targets, min_link, best_base
from robofab_torquebound.model import Arm, G
from robofab_torquebound import topp, trap

FR = (0.002, 0.005, 0.01, 0.015, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5)
NS = (400, 1600, 6400, 25600)
RS = (40, 160)
H, LAMBDA, M_GRIP, MU, DENSITY, BRANCH, TAU = 0.100, 1.0, 0.100, 0.5, 1240.0, -1, 5.0
pts = targets()
L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
print("# robofab-torquebound: six-part total carry time (s), no speed limit; time-optimal solver at node counts n; trapezoid at ramp sampling 40 / 160")
print(f"# n = {NS}; torque limit {TAU} N m; all parameters assumed as in robofab-toppconv. edge = 1 - T_opt/T_trap\n")
hdr = f"{'k':>4s} {'Ttrap40':>8s} {'Ttrap160':>8s} " + " ".join(f"{'T@'+str(n):>9s}" for n in NS) + f" {'e400/40':>8s} {'e25k/40':>8s} {'e25k/160':>8s} {'parts':>5s}"
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
    print(hdr)
    for k in (2.0, 5.0, math.inf):
        tt, to, cnt = {r: 0.0 for r in RS}, {n: 0.0 for n in NS}, 0
        for nm in arms:
            arm, (qa, qb) = arms[nm], qs[nm]
            cap = None if math.isinf(k) else k * mass[nm] * G / (2 * MU)
            profs = {n: topp.solve(arm, qa, qb, TAU, n=n, jaw_cap=cap, mass=mass[nm], mu=MU, wmax=None) for n in NS}
            bts = {r: trap.best_trap(arm, qa, qb, TAU, mass[nm], cap if cap else 1e9, MU, wmax=None, fracs=FR, j=0.0, ramp_samples=r) for r in RS}
            if None in profs.values() or None in bts.values():
                continue
            for r in RS:
                tt[r] += bts[r][0]
            for n in NS:
                to[n] += profs[n]["T"]
            cnt += 1
        row = {"L": L, "k": None if math.isinf(k) else k, "T_trap": tt, "T_opt": to, "parts": cnt,
               "edge_n400_r40": 1 - to[400] / tt[40], "edge_n25600_r40": 1 - to[25600] / tt[40], "edge_n25600_r160": 1 - to[25600] / tt[160]}
        out.append(row)
        print(f"{'inf' if math.isinf(k) else k:>4} {tt[40]:8.3f} {tt[160]:8.3f} " + " ".join(f"{to[n]:9.4f}" for n in NS)
              + f" {100*row['edge_n400_r40']:7.2f}% {100*row['edge_n25600_r40']:7.2f}% {100*row['edge_n25600_r160']:7.2f}% {cnt:5d}")
    print()
json.dump(out, open("experiments/results.json", "w"), indent=1)
