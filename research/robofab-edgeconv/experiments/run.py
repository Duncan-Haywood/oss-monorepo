"""(robofab-edgeconv) Re-solves the time-optimal carry at several node counts n for every speed-limited row of
robofab-scurvefine (3 arm sizes x k in {5, inf} x wmax in {2, 1} rad/s), estimates the n -> infinity total with a
Richardson step, and compares it with the ramp-resolved trapezoid on the fine ramp grid (same as robofab-scurvefine)."""
import json
import math
from robofab_edgeconv.geometry import GRIPPER, targets, min_link, best_base
from robofab_edgeconv.model import Arm, G
from robofab_edgeconv import topp, trap

FR = (0.002, 0.005, 0.01, 0.015, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5)
NS = (400, 1600, 6400)
H, LAMBDA, M_GRIP, MU, DENSITY, BRANCH, TAU = 0.100, 1.0, 0.100, 0.5, 1240.0, -1, 5.0
pts = targets()
L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
print("# robofab-edgeconv: six-part totals (s); T_n = time-optimal solver with n nodes; T_ext = Richardson estimate")
print("# T_ext = T_6400 - (T_1600 - T_6400)/3 (assumes error ~ 1/n, i.e. ratio 4 per step); edge = 1 - T/T_trap, in %\n")
print(f"{'L':>5s} {'k':>4s} {'w':>3s} {'T_trap':>7s} {'T_400':>7s} {'T_1600':>7s} {'T_6400':>7s} {'T_ext':>7s} {'edge400':>8s} {'edge6400':>8s} {'edgeExt':>8s} {'parts':>5s}")
out = []
for scale in (1.0, 1.5, 2.5):
    L = round(L0 * scale, 3)
    base = best_base(L * 1000, L * 1000, H * 1000, pts, step=10.0)
    if base is None:
        continue
    for k in (5.0, math.inf):
        for w in (2.0, 1.0):
            tn = {n: 0.0 for n in NS}
            ttrap, cnt = 0.0, 0
            for nm, p in pts.items():
                arm = Arm(L, L, LAMBDA * L, LAMBDA * L, M_GRIP + mass[nm])
                q = [arm.ik(math.hypot(p[kk][0] - base[0], p[kk][1] - base[1]) / 1000, p[kk][2] / 1000 - H, BRANCH) for kk in ("pick", "lift")]
                if None in q:
                    continue
                cap = None if math.isinf(k) else k * mass[nm] * G / (2 * MU)
                profs = {n: topp.solve(arm, q[0], q[1], TAU, n=n, jaw_cap=cap, mass=mass[nm], mu=MU, wmax=w) for n in NS}
                bt = trap.best_trap(arm, q[0], q[1], TAU, mass[nm], cap if cap else 1e9, MU, wmax=w, fracs=FR, ramp_samples=40)
                if None in profs.values() or bt is None:
                    continue
                for n in NS:
                    tn[n] += profs[n]["T"]
                ttrap += bt[0]
                cnt += 1
            ext = tn[6400] - (tn[1600] - tn[6400]) / 3
            e = lambda t: 100 * (1 - t / ttrap)
            r = {"L": L, "k": None if math.isinf(k) else k, "wmax": w, "T_trap": ttrap, "T_n": tn, "T_ext": ext,
                 "edge_400": e(tn[400]), "edge_6400": e(tn[6400]), "edge_ext": e(ext), "parts": cnt}
            out.append(r)
            print(f"{L:5.3f} {'inf' if math.isinf(k) else int(k):>4} {w:3.0f} {ttrap:7.3f} {tn[400]:7.3f} {tn[1600]:7.3f} {tn[6400]:7.3f} {ext:7.3f} {e(tn[400]):7.2f}% {e(tn[6400]):7.2f}% {e(ext):7.2f}% {cnt:5d}", flush=True)
json.dump(out, open("experiments/results.json", "w"), indent=1)
