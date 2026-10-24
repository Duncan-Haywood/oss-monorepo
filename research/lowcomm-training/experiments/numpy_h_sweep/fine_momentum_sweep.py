"""Milestone 2g (LOG.md): a fine grid of small outer momentum at the inner lr 2e picked for each H.

Reuses run() and the data setup of outer_momentum_sweep.py. Half B reports every cell (seeds 0..4); half A (seeds 100, 101) is reported alongside.
"""
import os
import sys
from multiprocessing import Pool
import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from outer_momentum_sweep import run, TUNE_SEEDS, REPORT_SEEDS, M, STEPS, model, cfg  # noqa: E402

PICK = {16: 0.03, 64: 0.01, 160: 0.01}
BETAS = [0.1, 0.2, 0.3]

if __name__ == "__main__":
    out = ["# 2g: M=%d, %d steps/worker, params=%d; outer lr 1, Nesterov beta grid, inner lr from 2e; halfA seeds %s, halfB seeds %s"
           % (M, STEPS, model.n_params(cfg), TUNE_SEEDS, REPORT_SEEDS), "# H beta inner_lr halfA_mean halfB_mean halfB_sd halfB_seeds"]
    with Pool(4) as pool:
        for H, ilr in PICK.items():
            for b in BETAS:
                a = pool.map(run, [(s, H, ilr, 1.0, b, "A") for s in TUNE_SEEDS])
                r = pool.map(run, [(s, H, ilr, 1.0, b, "B") for s in REPORT_SEEDS])
                out.append("%d %g %g %.4f %.4f %.4f %s" % (H, b, ilr, np.mean(a), np.mean(r), np.std(r, ddof=1), " ".join("%.4f" % x for x in r)))
                print(out[-1], flush=True)
    open(os.path.join(here, "fine_momentum_sweep_results.txt"), "w").write("\n".join(out) + "\n")
