"""(robofab-motorconv) Node-count convergence of the time-optimal carry under the motor torque-speed line of robofab-motorcurve.
Same nine rows and parts; for w0 in (inf, 20, 10, 6, 4) the solver is run at n = 400, 1600 and 6400. Trapezoid as in robofab-motorcurve."""
import json
import math
from robofab_motorconv.geometry import GRIPPER, targets, min_link, best_base
from robofab_motorconv.model import Arm, G
from robofab_motorconv import topp, trap

FR = (0.002, 0.005, 0.01, 0.015, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5)
NS, RS = (400, 1600, 6400), 40
W0S = (None, 20.0, 10.0, 6.0, 4.0)
H, LAMBDA, M_GRIP, MU, DENSITY, BRANCH, TAU = 0.100, 1.0, 0.100, 0.5, 1240.0, -1, 5.0
pts = targets()
L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
name = lambda w: "inf" if w is None else f"{w:g}"
print("# robofab-motorconv: six-part total time-optimal carry time (s) at n = 400, 1600, 6400; trapezoid time and edge at each n")
print("# 'none' = the solver returned no profile for that part at that n; totals are over parts feasible at every n and w0 for the row\n")
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
    for k in (2.0, 5.0, math.inf):
        per = {}   # (w0, n) -> part -> T_opt or None ; (w0, 'trap') -> part -> T_trap or None
        for w0 in W0S:
            per[(w0, "trap")] = {}
            for n in NS:
                per[(w0, n)] = {}
            for nm in arms:
                arm, (qa, qb) = arms[nm], qs[nm]
                cap = None if math.isinf(k) else k * mass[nm] * G / (2 * MU)
                bt = trap.best_trap(arm, qa, qb, TAU, mass[nm], cap if cap else 1e9, MU, fracs=FR, ramp_samples=RS, w0=w0)
                per[(w0, "trap")][nm] = None if bt is None else bt[0]
                for n in NS:
                    prof = topp.solve(arm, qa, qb, TAU, n=n, jaw_cap=cap, mass=mass[nm], mu=MU, w0=w0)
                    per[(w0, n)][nm] = None if prof is None else prof["T"]
        common = [nm for nm in arms if all(per[key][nm] is not None for key in per)]
        kk = "inf" if math.isinf(k) else k
        print(f"k={kk}: common parts {len(common)} of {len(arms)}; part-feasibility failures:",
              {f"w0={name(w)} n={n}": [nm for nm in arms if per[(w, n)][nm] is None] for w in W0S for n in NS if any(per[(w, n)][nm] is None for nm in arms)})
        print(f"{'w0':>5s} {'Ttrap':>8s} " + " ".join(f"{'T@'+str(n):>9s} {'edge@'+str(n):>9s}" for n in NS) + f" {'dT 1600->6400':>14s}")
        for w0 in W0S:
            tt = sum(per[(w0, "trap")][nm] for nm in common)
            ts = [sum(per[(w0, n)][nm] for nm in common) for n in NS]
            es = [1 - t / tt if tt else None for t in ts]
            row = {"L": L, "k": None if math.isinf(k) else k, "w0": w0, "parts": len(common), "T_trap": tt,
                   "T_opt": dict(zip(map(str, NS), ts)), "edge": dict(zip(map(str, NS), es)), "rel_change_1600_6400": (ts[1] - ts[2]) / ts[2] if ts[2] else None,
                   "failed": {str(n): [nm for nm in arms if per[(w0, n)][nm] is None] for n in NS}}
            out.append(row)
            print(f"{name(w0):>5s} {tt:8.3f} " + " ".join(f"{t:9.4f} {100*e:8.2f}%" for t, e in zip(ts, es)) + f" {100*row['rel_change_1600_6400']:13.3f}%", flush=True)
        print()
json.dump(out, open("experiments/results.json", "w"), indent=1)
