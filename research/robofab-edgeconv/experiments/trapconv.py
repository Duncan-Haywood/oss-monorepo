"""(robofab-edgeconv, quality fix 2026-11-14) Converges the trapezoid side of the comparison.

run.py and robofab-rampopt pick the ramp fraction f from a grid whose smallest value is 0.002 (rampopt refines only
between the grid optimum's neighbours, so it cannot go below 0.002 either). In the speed-limited rows the grid optimum
is that minimum for most parts, so the trapezoid was not converged. Here, per part, T(f) is evaluated on a log grid
from 1e-5 to 0.5 (41 points), then golden-section refined around the best grid point; the bisection on T uses a
tolerance of 1e-6 s (trap.converged_trap). The solver totals T_6400 and T_ext are read from results.json (run.py), so only the trapezoid is
recomputed. Writes trapconv.json; prints a table."""
import json
import math
from robofab_edgeconv.geometry import GRIPPER, targets, min_link, best_base
from robofab_edgeconv.model import Arm, G
from robofab_edgeconv import trap

H, LAMBDA, M_GRIP, MU, DENSITY, BRANCH, TAU = 0.100, 1.0, 0.100, 0.5, 1240.0, -1, 5.0


def main():
    prev = {(r["L"], r["k"], r["wmax"]): r for r in json.load(open("experiments/results.json"))}
    pts = targets()
    L0 = min_link(H * 1000, pts, step=10.0, lo=40, hi=400) / 1000
    mass = {n: DENSITY * (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * 1e-9 for n, b in GRIPPER.items()}
    print("# robofab-edgeconv trapconv: trapezoid with the ramp fraction converged over [1e-5, 0.5] (41-point log grid +")
    print("# golden section, bisection tol 1e-6 s) vs the 14-value grid of run.py; edge = 1 - T_solver/T_trap, in %;")
    print("# lb = sum over parts of max|dq|/wmax (no trapezoid or profile can beat it); fmin/fmax = range of optimal f\n")
    print(f"{'L':>5s} {'k':>4s} {'w':>3s} {'T_grid':>7s} {'T_conv':>7s} {'T_6400':>7s} {'T_ext':>7s} {'lb':>7s} "
          f"{'edgeGrid':>8s} {'edgeConv':>8s} {'edgeCExt':>8s} {'fmin':>8s} {'fmax':>8s} {'inter':>5s}")
    out = []
    for scale in (1.0, 1.5, 2.5):
        L = round(L0 * scale, 3)
        base = best_base(L * 1000, L * 1000, H * 1000, pts, step=10.0)
        for k in (5.0, math.inf):
            for w in (2.0, 1.0):
                tc, lb, fs, inter = 0.0, 0.0, [], 0
                for nm, p in pts.items():
                    arm = Arm(L, L, LAMBDA * L, LAMBDA * L, M_GRIP + mass[nm])
                    q = [arm.ik(math.hypot(p[kk][0] - base[0], p[kk][1] - base[1]) / 1000, p[kk][2] / 1000 - H, BRANCH) for kk in ("pick", "lift")]
                    cap = None if math.isinf(k) else k * mass[nm] * G / (2 * MU)
                    T, f, it = trap.converged_trap(arm, q[0], q[1], TAU, mass[nm], cap if cap else 1e9, mu=MU, wmax=w)
                    tc += T; fs.append(f); inter += it
                    lb += max(abs(q[1][0] - q[0][0]), abs(q[1][1] - q[0][1])) / w
                r0 = prev[(L, None if math.isinf(k) else k, w)]
                t64, text, tg = r0["T_n"]["6400"], r0["T_ext"], r0["T_trap"]
                r = {"L": L, "k": r0["k"], "wmax": w, "T_grid": tg, "T_conv": tc, "T_6400": t64, "T_ext": text, "lb": lb,
                     "edge_grid": 100 * (1 - t64 / tg), "edge_conv": 100 * (1 - t64 / tc), "edge_conv_ext": 100 * (1 - text / tc),
                     "f_opt": fs, "interior": inter}
                out.append(r)
                print(f"{L:5.3f} {'inf' if math.isinf(k) else int(k):>4} {w:3.0f} {tg:7.3f} {tc:7.3f} {t64:7.3f} {text:7.3f} {lb:7.3f} "
                      f"{r['edge_grid']:7.2f}% {r['edge_conv']:7.2f}% {r['edge_conv_ext']:7.2f}% {min(fs):8.5f} {max(fs):8.5f} {inter:3d}/6", flush=True)
    json.dump(out, open("experiments/trapconv.json", "w"), indent=1)


if __name__ == "__main__":
    main()
