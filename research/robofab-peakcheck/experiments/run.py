"""(robofab-peakcheck) The torque- and jaw-bound rows of robofab-torquebound re-checked with a dense trapezoid check.
Per part: best ramp fraction from the 14-value grid under the 160-ramp-sample check (T160), then the three best fractions are re-solved
with a dense check (N whole-move midpoints + R per ramp) and the shortest is kept (Tdense). The result is re-checked at 10x the density
and the peak the dense check could still miss is estimated from the local slope. Edge = 1 - T_opt(n=6400) / T_trap."""
import json
import math
from robofab_peakcheck.geometry import GRIPPER, targets, min_link, best_base
from robofab_peakcheck.model import Arm, G
from robofab_peakcheck import topp, trap, peak

FR = (0.002, 0.005, 0.01, 0.015, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5)
N, R = 10000, 1000          # dense check
N2, R2 = 100000, 10000      # verification of the dense answer
NOPT = 6400
H, LAMBDA, M_GRIP, MU, DENSITY, BRANCH, TAU = 0.100, 1.0, 0.100, 0.5, 1240.0, -1, 5.0
pts = targets()
L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
print("# robofab-peakcheck: six-part total carry time (s), no speed limit. T160 = trapezoid with 160 ramp samples (robofab-torquebound);")
print(f"# Tdense = trapezoid re-solved with a dense check (N={N}, R={R}); verify = peak utilisation of that answer at N={N2}, R={R2} (1.0 = on the limit);")
print(f"# bound = a-posteriori estimate of the peak still missed at the verify density. Time-optimal solver n={NOPT}. torque limit {TAU} N m.\n")
hdr = f"{'k':>4s} {'T160':>8s} {'Tdense':>8s} {'dT':>7s} {'T_opt':>8s} {'e160':>7s} {'edense':>7s} {'maxverify':>9s} {'maxbound':>8s} {'parts':>5s}"
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
    print(hdr, flush=True)
    for k in (2.0, 5.0, math.inf):
        t160 = td = to = 0.0
        vmax = bmax = 0.0
        cnt = 0
        for nm in arms:
            arm, (qa, qb) = arms[nm], qs[nm]
            cap = None if math.isinf(k) else k * mass[nm] * G / (2 * MU)
            prof = topp.solve(arm, qa, qb, TAU, n=NOPT, jaw_cap=cap, mass=mass[nm], mu=MU, wmax=None)
            per_f = [(trap.min_time_trap(arm, qa, qb, TAU, mass[nm], cap if cap else 1e9, f, mu=MU, wmax=None, ramp_samples=160), f) for f in FR]
            per_f = sorted((t, f) for t, f in per_f if t is not None)
            if prof is None or not per_f:
                continue
            best = None
            for t0, f in per_f[:3]:
                t = peak.min_time_dense(arm, qa, qb, TAU, mass[nm], cap, f, t0, N, R, mu=MU, tol=1e-4)
                if t is not None and (best is None or t < best[0]):
                    best = (t, f)
            if best is None:
                continue
            u, s = peak.peak_util(arm, qa, qb, best[0], best[1], TAU, mass[nm], cap, N2, R2, MU)
            t160 += per_f[0][0]
            td += best[0]
            to += prof["T"]
            vmax = max(vmax, u)
            bmax = max(bmax, peak.missed_bound(s, (best[1], 1 - best[1])))
            cnt += 1
        row = {"L": L, "k": None if math.isinf(k) else k, "T160": t160, "Tdense": td, "T_opt": to, "parts": cnt,
               "max_verify_util": vmax, "max_missed_bound": bmax, "edge160": 1 - to / t160, "edge_dense": 1 - to / td}
        out.append(row)
        print(f"{'inf' if math.isinf(k) else k:>4} {t160:8.4f} {td:8.4f} {100*(td/t160-1):6.3f}% {to:8.4f} {100*row['edge160']:6.2f}% "
              f"{100*row['edge_dense']:6.2f}% {vmax:9.5f} {bmax:8.5f} {cnt:5d}", flush=True)
    print()
json.dump(out, open("experiments/results.json", "w"), indent=1)
