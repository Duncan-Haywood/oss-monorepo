"""(robofab-scurve) Adds jerk-limited S-curve comparators (jerk share j = 0.5 and 1.0 of each ramp) to the
robofab-trapezoid experiment, all on the same ramp-fraction grid.
Carry each free part of the toy gripper (pick -> lift above place) under a joint torque limit, a jaw-force cap
(k x static hold force) AND a joint speed limit wmax. Compare the time-optimal profile with the shortest min-jerk
move meeting the same limits. wmax = inf is the robofab-jawcap case."""
import json
import math
from robofab_scurve.geometry import GRIPPER, targets, min_link, best_base
from robofab_scurve.model import Arm, G
from robofab_scurve import topp, trap

FR = (0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5)   # ramp-fraction grid shared by all three comparators
JS = (0.0, 0.5, 1.0)                        # 0 = trapezoid, else jerk share of each ramp

H, LAMBDA, M_GRIP, MU, DENSITY, BRANCH = 0.100, 1.0, 0.100, 0.5, 1240.0, -1
WS = (math.inf, 6.0, 4.0, 3.0, 2.0, 1.0)      # joint speed limits, rad/s
KS = (2.0, 5.0, math.inf)
TAU = 5.0
pts = targets()
L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
print("# robofab-scurve: carry time under torque, jaw-force and joint-speed limits, six free parts")
print(f"# torque limit {TAU} N m, shoulder {H} m, link mass {LAMBDA} kg/m, gripper {M_GRIP} kg, mu {MU}, density {DENSITY}; all assumed")
print("# jaw cap = k x static hold force m g/(2 mu); wmax = peak joint speed limit (rad/s); parts = how many of six were feasible\n")
out = []
for scale in (1.0, 1.5, 2.5):
    L = round(L0 * scale, 3)
    base = best_base(L * 1000, L * 1000, H * 1000, pts, step=10.0)
    if base is None:
        continue
    arms, qs = {}, {}
    for n, p in pts.items():
        arm = Arm(L, L, LAMBDA * L, LAMBDA * L, M_GRIP + mass[n])
        q = [arm.ik(math.hypot(p[k][0] - base[0], p[k][1] - base[1]) / 1000, p[k][2] / 1000 - H, BRANCH) for k in ("pick", "lift")]
        if None not in q:
            arms[n], qs[n] = arm, q
    for k in KS:
        print(f"## L={L} m, k={'inf' if math.isinf(k) else k}")
        print(f"{'wmax':>5s} {'T_trap':>7s} {'T_s.5':>7s} {'T_s1':>7s} {'T_opt':>7s} {'s.5 cost':>8s} {'s1 cost':>8s} {'opt vs trap':>11s} {'opt vs s1':>9s} {'parts':>5s}")
        rows = []
        for w in WS:
            tt = {j: 0.0 for j in JS}
            topt = 0.0
            cnt = 0
            for n in arms:
                arm, (qa, qb) = arms[n], qs[n]
                cap = None if math.isinf(k) else k * mass[n] * G / (2 * MU)
                wm = None if math.isinf(w) else w
                prof = topp.solve(arm, qa, qb, TAU, jaw_cap=cap, mass=mass[n], mu=MU, wmax=wm)
                bts = {j: trap.best_trap(arm, qa, qb, TAU, mass[n], cap if cap else 1e9, MU, wmax=wm, fracs=FR, j=j) for j in JS}
                if prof is None or None in bts.values():
                    continue
                for j in JS:
                    tt[j] += bts[j][0]
                topt += prof["T"]
                cnt += 1
            rows.append({"wmax": None if math.isinf(w) else w, "T_trap": tt[0.0], "T_s05": tt[0.5], "T_s10": tt[1.0], "T_opt": topt, "parts": cnt})
        for r in rows:
            ws = "inf" if r["wmax"] is None else f"{r['wmax']:.1f}"
            print(f"{ws:>5s} {r['T_trap']:7.3f} {r['T_s05']:7.3f} {r['T_s10']:7.3f} {r['T_opt']:7.3f} {100*(r['T_s05']/r['T_trap']-1):7.1f}% {100*(r['T_s10']/r['T_trap']-1):7.1f}% {100*(1-r['T_opt']/r['T_trap']):10.1f}% {100*(1-r['T_opt']/r['T_s10']):8.1f}% {r['parts']:5d}")
        print()
        out.append({"L": L, "k": None if math.isinf(k) else k, "tau": TAU, "rows": rows})
json.dump(out, open("experiments/results.json", "w"), indent=1)
