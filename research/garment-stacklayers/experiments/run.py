"""Layer-count sweep. Seeded; writes experiments/results.txt."""
import os
import sys
from multiprocessing import Pool

import numpy as np

here = os.path.dirname(__file__)
sys.path[:0] = [os.path.join(here, "..", "src")] + [os.path.join(here, "..", "..", p, "src")
                for p in ("garment-stackopt", "garment-thincolor", "garment-stackpareto")]
from garment_stackopt.opt import baseline_stack, colour  # noqa: E402
from garment_stacklayers.layers import feasible, metrics, solve  # noqa: E402

BUDGET, SEEDS = 3000, 8
NS = (2, 4, 6, 8, 10, 12)
CASES = ((620, 40.0, 4.0), (620, 40.0, 3.0), (450, 35.0, 4.0))  # (target nm, C* floor, mass cap g/m2)


def job(a):
    ci, n, s, th, cf, mc = a
    d = solve(n, th, cf, mc, BUDGET, 1000 * ci + 100 * n + s)
    sh, c, hd, m = metrics(d, th)
    return ci, n, s, sh, c, m, feasible(d, th, cf, mc)


if __name__ == "__main__":
    out = []

    def p(s=""):
        out.append(s)
        print(s)

    p(f"Budget {BUDGET} calls per run (Nelder-Mead restarts), {SEEDS} seeds per cell. Shift = mean dE76 at 15/30/45 deg.")
    p("Feasible = C* >= floor, |hue - target| <= 30 deg, oxide mass <= cap. Same budget for every N.\n")
    jobs = []
    for ci, (lam, cf, mc) in enumerate(CASES):
        th = colour(baseline_stack(lam, 4))[4]
        jobs += [(ci, n, s, th, cf, mc) for n in NS for s in range(SEEDS)]
    with Pool(4) as pool:
        res = pool.map(job, jobs)
    for ci, (lam, cf, mc) in enumerate(CASES):
        p(f"== target {lam} nm, C* floor {cf:.0f}, mass cap {mc:.1f} g/m2")
        p(f"{'layers':>6s} {'feasible':>8s} {'best shift':>10s} {'median shift':>12s} {'C* of best':>10s} {'mass of best':>12s}")
        for n in NS:
            ok = [x for x in res if x[0] == ci and x[1] == n and x[6]]
            if ok:
                b = min(ok, key=lambda x: x[3])
                p(f"{n:6d} {len(ok):>5d}/{SEEDS:<2d} {b[3]:10.2f} {np.median([x[3] for x in ok]):12.2f} {b[4]:10.1f} {b[5]:12.2f}")
            else:
                p(f"{n:6d} {0:>5d}/{SEEDS:<2d} {'-':>10s} {'-':>12s} {'-':>10s} {'-':>12s}")
        p("")
    with open(os.path.join(here, "results.txt"), "w") as fh:
        fh.write("\n".join(out) + "\n")
