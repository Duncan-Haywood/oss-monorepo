"""(robofab-toppconv) Re-solves the time-optimal profile of robofab-scurvefine at several node counts n for all 12 rows
(3 arm sizes x jaw cap k = 5 / none x wmax = 2 / 1 rad/s, six printed parts each), and recomputes the edge over the
ramp-resolved trapezoid (fine 14-value grid, 40 extra samples per ramp, as in robofab-scurvefine) at each n.
Also estimates the convergence order p from three successive n (each x4) and a Richardson-extrapolated T_opt."""
import json
import math
from robofab_toppconv.geometry import GRIPPER, targets, min_link, best_base
from robofab_toppconv.model import Arm, G
from robofab_toppconv import topp, trap

FR = (0.002, 0.005, 0.01, 0.015, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5)
NS = (400, 1600, 6400, 25600)
H, LAMBDA, M_GRIP, MU, DENSITY, BRANCH, TAU = 0.100, 1.0, 0.100, 0.5, 1240.0, -1, 5.0
pts = targets()
L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
print("# robofab-toppconv: six-part total carry time (s) of the time-optimal solver at node counts n, and the ramp-resolved trapezoid")
print("# p = log4((T1600-T6400)/(T6400-T25600)) is the observed order from the last three n; T_ext = Richardson extrapolation using it (crude: p is noisy); edge = 1 - T/T_trap")
print(f"# n = {NS}; torque limit {TAU} N m; all parameters assumed as in robofab-scurvefine\n")
hdr = f"{'wmax':>5s} {'T_trap':>8s} " + " ".join(f"{'T@'+str(n):>9s}" for n in NS) + f" {'p':>5s} {'T_ext':>8s} {'edge400':>8s} {'edge25k':>8s} {'edge_ext':>8s} {'parts':>5s}"
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
    for k in (5.0, math.inf):
        print(f"## L={L} m, k={'inf' if math.isinf(k) else k}")
        print(hdr)
        for w in (2.0, 1.0):
            tt, to, cnt = 0.0, {n: 0.0 for n in NS}, 0
            for nm in arms:
                arm, (qa, qb) = arms[nm], qs[nm]
                cap = None if math.isinf(k) else k * mass[nm] * G / (2 * MU)
                profs = {n: topp.solve(arm, qa, qb, TAU, n=n, jaw_cap=cap, mass=mass[nm], mu=MU, wmax=w) for n in NS}
                bt = trap.best_trap(arm, qa, qb, TAU, mass[nm], cap if cap else 1e9, MU, wmax=w, fracs=FR, j=0.0, ramp_samples=40)
                if None in profs.values() or bt is None:
                    continue
                tt += bt[0]
                for n in NS:
                    to[n] += profs[n]["T"]
                cnt += 1
            d1, d2 = to[NS[1]] - to[NS[2]], to[NS[2]] - to[NS[3]]
            p = math.log(d1 / d2, 4) if d1 > 0 and d2 > 0 else None
            ext = to[NS[3]] - d2 / (4 ** p - 1) if p else None
            row = {"L": L, "k": None if math.isinf(k) else k, "wmax": w, "T_trap": tt, "T_opt": to, "order": p, "T_ext": ext,
                   "edge_n400": 1 - to[400] / tt, "edge_n25600": 1 - to[25600] / tt, "edge_ext": None if ext is None else 1 - ext / tt, "parts": cnt}
            out.append(row)
            ps = "  n/a" if p is None else f"{p:5.2f}"
            es = "     n/a" if ext is None else f"{ext:8.3f}"
            ee = "     n/a" if ext is None else f"{100*row['edge_ext']:7.2f}%"
            print(f"{w:5.1f} {tt:8.3f} " + " ".join(f"{to[n]:9.4f}" for n in NS) + f" {ps} {es} {100*row['edge_n400']:7.2f}% {100*row['edge_n25600']:7.2f}% {ee} {cnt:5d}")
        print()
json.dump(out, open("experiments/results.json", "w"), indent=1)
