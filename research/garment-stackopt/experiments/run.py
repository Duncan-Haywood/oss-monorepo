"""Experiments for garment-stackopt. Seeded; writes experiments/results.txt (about 5 minutes)."""
import os
import sys

import numpy as np

here = os.path.dirname(__file__)
sys.path[:0] = [os.path.join(here, "..", "src"), os.path.join(here, "..", "..", "garment-thincolor", "src")]
from garment_stackopt.opt import *  # noqa: E402

from garment_thincolor.model import areal_mass_g_m2  # noqa: E402

BUDGET, SEEDS, N_LAYERS = 3000, 10, 8
RHO = [4230.0, 2200.0] * (N_LAYERS // 2)
out = []


def p(s=""):
    out.append(s)
    print(s)


p(f"Budget {BUDGET} objective calls per run, {SEEDS} seeds, {N_LAYERS} layers (hi/lo alternating, hi on top), thickness bounds {D_MIN:.0f}-{D_MAX:.0f} nm")
p(f"Objective = mean dE76 (15/30/45 deg vs normal) + 5*max(0, {C_MIN:.0f}-C*) + max(0, |hue-target|-{H_TOL:.0f}); lower is better\n")
for lam in (620, 450):
    base = baseline_stack(lam, N_LAYERS // 2)
    c0 = colour(base)
    th = c0[4]
    v0, pen0 = objective(base, th)
    p(f"== target: quarter-wave stack designed at {lam} nm (hue {th:.0f}, C* {c0[3]:.1f}, shift {shift(base):.1f}, mass {areal_mass_g_m2(build(base), RHO):.2f} g/m2)")
    p(f"{'method':>24s}  {'median J':>8s} {'best J':>7s} {'worst J':>8s}  {'median C*':>9s} {'median shift':>12s} {'feasible':>8s} {'median mass g/m2':>16s}")
    p(f"{'quarter-wave (1 point)':>24s}  {v0:8.2f} {v0:7.2f} {v0:8.2f}  {c0[3]:9.1f} {shift(base):12.1f} {'yes' if pen0 == 0 else 'no':>8s} {areal_mass_g_m2(build(base), RHO):16.2f}")
    for name, fn in OPTIMISERS.items():
        res = []
        for s in range(SEEDS):
            f = Budget(th, BUDGET)
            fn(f, N_LAYERS, np.random.default_rng(1000 * lam + s))
            d = f.bestx
            c = colour(d)
            _, pen = objective(d, th)
            res.append((f.best, c[3], shift(d), pen == 0, areal_mass_g_m2(build(d), RHO)))
        r = np.array(res, float)
        p(f"{name:>24s}  {np.median(r[:, 0]):8.2f} {r[:, 0].min():7.2f} {r[:, 0].max():8.2f}  {np.median(r[:, 1]):9.1f} {np.median(r[:, 2]):12.1f} {int(r[:, 3].sum()):>5d}/{SEEDS:<2d} {np.median(r[:, 4]):16.2f}")
    p("")
with open(os.path.join(here, "results.txt"), "w") as fh:
    fh.write("\n".join(out) + "\n")
