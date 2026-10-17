"""Experiments for garment-stackpareto. Seeded; writes experiments/results.txt (about 6 minutes on 4 cores)."""
import os
import sys
from multiprocessing import Pool

import numpy as np

here = os.path.dirname(__file__)
sys.path[:0] = [os.path.join(here, "..", "src"), os.path.join(here, "..", "..", "garment-stackopt", "src"),
                os.path.join(here, "..", "..", "garment-thincolor", "src")]
from garment_stackopt.opt import baseline_stack, colour  # noqa: E402
from garment_stackpareto.front import feasible, mass, metrics, pareto_mask, solve_cell  # noqa: E402

BUDGET, SEEDS = 3000, 5
TARGETS = {620: (40.0, 50.0, 60.0), 450: (35.0, 42.0, 50.0)}
CAPS = (1.5, 2.0, 3.0, 4.0)


def job(a):
    lam, cf, mc, s, th = a
    d = solve_cell(th, cf, mc, BUDGET, 100000 * lam + 1000 * int(cf) + 10 * int(mc * 10) + s)
    sh, c, hd, m = metrics(d, th)
    return lam, cf, mc, s, sh, c, hd, m, feasible(d, th, cf, mc)


if __name__ == "__main__":
    out = []

    def p(s=""):
        out.append(s)
        print(s)

    p(f"Budget {BUDGET} calls per run (Nelder-Mead restarts), {SEEDS} seeds per cell, 8 layers. Shift = mean dE76 at 15/30/45 deg.")
    p("Constraints: C* >= floor, |hue - target| <= 30 deg, oxide mass <= cap (g/m2). Cell result = best feasible run of the 5.\n")
    hues, jobs = {}, []
    for lam, floors in TARGETS.items():
        b = baseline_stack(lam, 4)
        hues[lam] = colour(b)[4]
        for cf in floors:
            for mc in CAPS:
                jobs += [(lam, cf, mc, s, hues[lam]) for s in range(SEEDS)]
    with Pool(4) as pool:
        res = pool.map(job, jobs)
    allpts = {}
    for lam, floors in TARGETS.items():
        b = baseline_stack(lam, 4)
        sh0, c0, _, m0 = metrics(b, hues[lam])
        p(f"== target {lam} nm quarter-wave stack: shift {sh0:.1f}, C* {c0:.1f}, mass {m0:.2f} g/m2")
        p(f"{'C* floor':>8s} {'mass cap':>8s} {'feasible':>8s} {'best shift':>10s} {'median shift':>12s} {'C* of best':>10s} {'mass of best':>12s}")
        pts = []
        for cf in floors:
            for mc in CAPS:
                r = [x for x in res if x[0] == lam and x[1] == cf and x[2] == mc]
                ok = [x for x in r if x[8]]
                if ok:
                    best = min(ok, key=lambda x: x[4])
                    pts.append((best[4], -best[5], best[7], cf, mc))
                    p(f"{cf:8.0f} {mc:8.1f} {len(ok):>5d}/{SEEDS:<2d} {best[4]:10.2f} {np.median([x[4] for x in ok]):12.2f} {best[5]:10.1f} {best[7]:12.2f}")
                else:
                    p(f"{cf:8.0f} {mc:8.1f} {0:>5d}/{SEEDS:<2d} {'-':>10s} {'-':>12s} {'-':>10s} {'-':>12s}")
        if pts:
            P = np.array([x[:3] for x in pts])
            keep = pareto_mask(P)
            p(f"Non-dominated cells over (shift, -C*, mass), by achieved values: {int(keep.sum())} of {len(pts)}")
            for k, x in zip(keep, pts):
                if k:
                    p(f"   shift {x[0]:.2f}  C* {-x[1]:.1f}  mass {x[2]:.2f}   (cell: floor {x[3]:.0f}, cap {x[4]:.1f})")
        p("")
    with open(os.path.join(here, "results.txt"), "w") as fh:
        fh.write("\n".join(out) + "\n")
