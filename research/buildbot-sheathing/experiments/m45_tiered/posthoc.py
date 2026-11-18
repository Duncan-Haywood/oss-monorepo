"""Post hoc (not registered), milestone 45: how good a wrist sensor (H1 (1.4 m, -0.15 m)) needs.

The run found the stance caps the right hip roll's margin at T_H = 0.0339 N m whatever the other leg rows give up,
and a 0.2 N sensor error moves it about 0.033 N m. Here: (1) the right hip roll's torque shift (settled minus
planned) per newton of sensor error along each axis, zero hose force, tiered plan, at both window ends; and (2) the
worst residual along the wall at the pose ('braked', S 10 N, hose drag 0 and 5 N, every hose direction and sensor
axis) for |e| in {0.05, 0.1, 0.15, 0.2} N, with the hold-set margin at beta 0.9 (the run's) and 0.99.
Writes posthoc.txt. Imports run.py (about 100 s)."""
import importlib.util
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m45", os.path.join(HERE, "run.py"))
R = importlib.util.module_from_spec(spec)
sys.modules["m45"] = R
spec.loader.exec_module(R)
M1 = R.M1
K = ("h1", 1.4, -0.15)
BS = [0.05, 0.1, 0.15, 0.2]


def set_b(beta):
    R.set_tier(True)
    v = R.INFO[K]
    R.TIER[K] = (min(R.M_SPEC, beta * v["T_H"]), R.TIER[K][1])
    M1.PLANS.clear()


def task(args):
    beta, b, H = args
    set_b(beta)
    M1.GAPR = R.R43.gaps(M1, "h1", "braked")
    worst, n_ok, n_all = None, 0, 0
    for i in M1.phis_for(H):
        phi = M1.PHIS[i] if H > 0 else 0.0
        for a in M1.AXES:
            rg = M1.residuals("h1", H, phi, b * a, R.S_STAR)
            n_all += 1
            if K in rg:
                n_ok += 1
                y = abs(rg[K]["y"][0]) / M1.MM
                if worst is None or y > worst[0]:
                    worst = (y, round(math.degrees(phi)))
    return beta, b, H, worst, n_ok, n_all


if __name__ == "__main__":
    set_b(0.9)
    names = M1.ROB["h1"][1]
    j = names.index("right_hip_roll_joint") if "right_hip_roll_joint" in names else names.index("right_hip_roll")
    z = np.zeros(3)
    L = [f"T_H at (1.4, -0.15) = {R.INFO[K]['T_H']:.4f} N m (binding: {R.INFO[K]['bind']}); m_H at beta 0.9 = "
         f"{R.TIER[K][0]:.4f}, at 0.99 = {0.99 * R.INFO[K]['T_H']:.4f}",
         "(1) right hip roll torque shift (settled - planned, N m) per 1 N of sensor error, zero hose force, beta 0.9: "
         "axis | 25 N end | 50 N end"]
    for a in M1.AXES:
        p = M1.plan(K, z, np.asarray(a, float), R.S_STAR)
        if p is None:
            L.append(f"  {[int(v) for v in a]} | no plan")
            continue
        ta, tp = p[0], p[1]
        L.append(f"  {[int(v) for v in a]} | {ta[0][j] - tp[0][j]:+.4f} | {ta[1][j] - tp[1][j]:+.4f}")
    jobs = [(beta, b, H) for beta in (0.9, 0.99) for b in BS for H in (0.0, 5.0)]
    with M1.mp.get_context("fork").Pool(4) as pool:
        res = pool.map(task, jobs, chunksize=1)
    L.append("(2) worst residual along the wall at (1.4, -0.15), 'braked', S 10 N: beta | |e| (N) | H (N) | "
             "worst |y| (mm, at phi) | cases with a plan")
    for beta, b, H, w, ok, na in res:
        L.append(f"  {beta:4.2f} | {b:4.2f} | {H:4.1f} | " + ("-" if w is None else f"{w[0]:.3f} (phi {w[1]})")
                 + f" | {ok} of {na}")
    open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
