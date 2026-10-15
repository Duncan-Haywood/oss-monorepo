"""(robofab-rampopt) For the twelve speed-limited rows of robofab-edgeconv, refines the trapezoid's ramp fraction by
golden-section search around the grid optimum and compares the time-optimal solver (n = 6400) with both the
grid-tuned and the refined trapezoid."""
import json
import math
from robofab_rampopt.geometry import GRIPPER, targets, min_link, best_base
from robofab_rampopt.model import Arm, G
from robofab_rampopt import topp, trap

FR = (0.002, 0.005, 0.01, 0.015, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5)
N = 6400
H, LAMBDA, M_GRIP, MU, DENSITY, BRANCH, TAU = 0.100, 1.0, 0.100, 0.5, 1240.0, -1, 5.0
pts = targets()
L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
print("# robofab-rampopt: six-part totals (s); T_grid = trapezoid, best ramp on the 14-value grid; T_ref = after golden-section refinement")
print("# T_sol = time-optimal solver, n = 6400; edge = 1 - T_sol/T_trap, in %; gain = 1 - T_ref/T_grid, in %; evals = extra trapezoid solves\n")
print(f"{'L':>5s} {'k':>4s} {'w':>3s} {'T_grid':>7s} {'T_ref':>7s} {'T_sol':>7s} {'gain':>6s} {'edgeGrid':>8s} {'edgeRef':>8s} {'evals':>5s} {'parts':>5s}")
out = []
for scale in (1.0, 1.5, 2.5):
    L = round(L0 * scale, 3)
    base = best_base(L * 1000, L * 1000, H * 1000, pts, step=10.0)
    if base is None:
        continue
    for k in (5.0, math.inf):
        for w in (2.0, 1.0):
            tsol = tg = tr = 0.0
            cnt = evals = 0
            for nm, p in pts.items():
                arm = Arm(L, L, LAMBDA * L, LAMBDA * L, M_GRIP + mass[nm])
                q = [arm.ik(math.hypot(p[kk][0] - base[0], p[kk][1] - base[1]) / 1000, p[kk][2] / 1000 - H, BRANCH) for kk in ("pick", "lift")]
                if None in q:
                    continue
                cap = None if math.isinf(k) else k * mass[nm] * G / (2 * MU)
                prof = topp.solve(arm, q[0], q[1], TAU, n=N, jaw_cap=cap, mass=mass[nm], mu=MU, wmax=w)
                bt = trap.best_trap(arm, q[0], q[1], TAU, mass[nm], cap if cap else 1e9, MU, wmax=w, fracs=FR, ramp_samples=40)
                if prof is None or bt is None:
                    continue
                T, f, ev = trap.refine_trap(arm, q[0], q[1], TAU, mass[nm], cap if cap else 1e9, bt, FR, mu=MU, wmax=w, ramp_samples=40)
                tsol += prof["T"]; tg += bt[0]; tr += T; evals += ev; cnt += 1
            r = {"L": L, "k": None if math.isinf(k) else k, "wmax": w, "T_grid": tg, "T_ref": tr, "T_sol": tsol,
                 "gain": 100 * (1 - tr / tg), "edge_grid": 100 * (1 - tsol / tg), "edge_ref": 100 * (1 - tsol / tr), "evals": evals, "parts": cnt}
            out.append(r)
            print(f"{L:5.3f} {'inf' if math.isinf(k) else int(k):>4} {w:3.0f} {tg:7.3f} {tr:7.3f} {tsol:7.3f} {r['gain']:5.2f}% {r['edge_grid']:7.2f}% {r['edge_ref']:7.2f}% {evals:5d} {cnt:5d}", flush=True)
json.dump(out, open("experiments/results.json", "w"), indent=1)
