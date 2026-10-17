"""Carry each free part of the toy gripper (pick -> lift above place) under a joint torque limit, a jaw-force cap
(k x static hold force) AND a joint speed limit wmax. Compare the time-optimal profile with the shortest min-jerk
move meeting the same limits. wmax = inf is the robofab-jawcap case."""
import json
import math
from robofab_jointspeed.geometry import GRIPPER, targets, min_link, best_base
from robofab_jointspeed.model import Arm, G, min_time_capped
from robofab_jointspeed import topp

H, LAMBDA, M_GRIP, MU, DENSITY, BRANCH = 0.100, 1.0, 0.100, 0.5, 1240.0, -1
WS = (math.inf, 6.0, 4.0, 3.0, 2.0, 1.0)      # joint speed limits, rad/s
KS = (2.0, 5.0, math.inf)
TAU = 5.0
pts = targets()
L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
print("# robofab-jointspeed: carry time under torque, jaw-force and joint-speed limits, six free parts")
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
        print(f"{'wmax':>5s} {'T_mj s':>8s} {'T_opt s':>8s} {'saved':>6s} {'opt/opt(inf)':>12s} {'peak w opt':>10s} {'parts':>5s}")
        rows = []
        for w in WS:
            tmj = topt = pk = 0.0
            cnt = 0
            for n in arms:
                arm, (qa, qb) = arms[n], qs[n]
                cap = None if math.isinf(k) else k * mass[n] * G / (2 * MU)
                wm = None if math.isinf(w) else w
                prof = topp.solve(arm, qa, qb, TAU, jaw_cap=cap, mass=mass[n], mu=MU, wmax=wm)
                mj = min_time_capped(arm, qa, qb, TAU, mass[n], cap if cap else 1e9, MU, wmax=wm)
                if prof is None or mj is None:
                    continue
                pk = max(pk, topp.peak_joint_speed(qa, qb, prof))
                tmj += mj
                topt += prof["T"]
                cnt += 1
            rows.append({"wmax": None if math.isinf(w) else w, "T_minjerk": tmj, "T_opt": topt, "parts": cnt, "peak_speed_opt": pk})
        t0 = rows[0]["T_opt"]
        for r in rows:
            ws = "inf" if r["wmax"] is None else f"{r['wmax']:.1f}"
            print(f"{ws:>5s} {r['T_minjerk']:8.3f} {r['T_opt']:8.3f} {100*(1-r['T_opt']/r['T_minjerk']):5.0f}% {r['T_opt']/t0:12.2f} {r['peak_speed_opt']:10.2f} {r['parts']:5d}")
        print()
        out.append({"L": L, "k": None if math.isinf(k) else k, "tau": TAU, "rows": rows})
json.dump(out, open("experiments/results.json", "w"), indent=1)
