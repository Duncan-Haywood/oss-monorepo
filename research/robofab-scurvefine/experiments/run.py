"""(robofab-scurvefine) Re-runs the robofab-scurve speed-limited rows (wmax 2 and 1 rad/s) on a finer ramp-fraction grid,
with and without ramp-resolved torque/jaw-force sampling, to test whether the time-optimal edge there was grid-limited.
Carry each free part of the toy gripper (pick -> lift above place) under a joint torque limit, a jaw-force cap
(k x static hold force) AND a joint speed limit wmax. Compare the time-optimal profile with the shortest min-jerk
move meeting the same limits. wmax = inf is the robofab-jawcap case."""
import json
import math
from robofab_scurvefine.geometry import GRIPPER, targets, min_link, best_base
from robofab_scurvefine.model import Arm, G
from robofab_scurvefine import topp, trap

FR_COARSE = (0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5)   # grid of robofab-scurve
FR_FINE = (0.002, 0.005, 0.01, 0.015, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5)   # superset of the coarse grid
JS = (0.0, 0.5, 1.0)                        # 0 = trapezoid, else jerk share of each ramp

H, LAMBDA, M_GRIP, MU, DENSITY, BRANCH = 0.100, 1.0, 0.100, 0.5, 1240.0, -1
WS = (2.0, 1.0)      # joint speed limits, rad/s
KS = (5.0, math.inf)
TAU = 5.0
pts = targets()
L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
print("# robofab-scurvefine: carry time under torque, jaw-force and joint-speed limits, six free parts")
print(f"# torque limit {TAU} N m, shoulder {H} m, link mass {LAMBDA} kg/m, gripper {M_GRIP} kg, mu {MU}, density {DENSITY}; all assumed")
print("# jaw cap = k x static hold force m g/(2 mu); wmax = peak joint speed limit (rad/s); parts = how many of six were feasible\n# grid: coarse = robofab-scurve grid, naive 201-point sampling; fine = 14-value grid, naive sampling; resolved = fine grid + 40 extra samples in each ramp\n")
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
        print(f"{'wmax':>5s} {'grid':>6s} {'T_trap':>7s} {'T_s.5':>7s} {'T_s1':>7s} {'T_opt':>7s} {'s.5 cost':>8s} {'s1 cost':>8s} {'opt vs trap':>11s} {'edge f':>7s} {'parts':>5s}")
        rows = []
        for w in WS:
            tt = {(g, j): 0.0 for g in ("coarse", "fine", "resolved") for j in JS}
            topt, cnt, fm = 0.0, 0, [1.0, 1.0]
            for n in arms:
                arm, (qa, qb) = arms[n], qs[n]
                cap = None if math.isinf(k) else k * mass[n] * G / (2 * MU)
                wm = None if math.isinf(w) else w
                prof = topp.solve(arm, qa, qb, TAU, jaw_cap=cap, mass=mass[n], mu=MU, wmax=wm)
                bts = {(g, j): trap.best_trap(arm, qa, qb, TAU, mass[n], cap if cap else 1e9, MU, wmax=wm, fracs=fr, j=j, ramp_samples=rs)
                       for g, fr, rs in (("coarse", FR_COARSE, 0), ("fine", FR_FINE, 0), ("resolved", FR_FINE, 40)) for j in JS}
                if prof is None or None in bts.values():
                    continue
                for key in bts:
                    tt[key] += bts[key][0]
                fm[0] = min(fm[0], bts[("fine", 0.0)][1]); fm[1] = min(fm[1], bts[("resolved", 0.0)][1])
                topt += prof["T"]
                cnt += 1
            for g in ("coarse", "fine", "resolved"):
                r = {"wmax": None if math.isinf(w) else w, "grid": g, "T_trap": tt[(g, 0.0)], "T_s05": tt[(g, 0.5)],
                     "T_s10": tt[(g, 1.0)], "T_opt": topt, "min_best_f_trap": {"fine": fm[0], "resolved": fm[1]}.get(g), "parts": cnt}
                rows.append(r)
                ws = "inf" if r["wmax"] is None else f"{r['wmax']:.1f}"
                ef = f"{r['min_best_f_trap']:7.3f}" if g != "coarse" else "      -"
                print(f"{ws:>5s} {g:>6s} {r['T_trap']:7.3f} {r['T_s05']:7.3f} {r['T_s10']:7.3f} {r['T_opt']:7.3f} {100*(r['T_s05']/r['T_trap']-1):7.1f}% {100*(r['T_s10']/r['T_trap']-1):7.1f}% {100*(1-r['T_opt']/r['T_trap']):10.1f}% {ef} {cnt:5d}")
        print()
        out.append({"L": L, "k": None if math.isinf(k) else k, "tau": TAU, "rows": rows})
json.dump(out, open("experiments/results.json", "w"), indent=1)
