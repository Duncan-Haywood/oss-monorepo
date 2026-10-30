"""Milestone 2g (LOG.md): finer outer-momentum grid {0.1, 0.2, 0.3} at tuned inner lr, reported on half B (seeds 0..4).

The plain-averaging reference rows are 2e's (inner_lr_sweep_results.txt, '## report' section); runs are deterministic.
"""
import os
import sys
from multiprocessing import Pool
import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
import outer_momentum_sweep as o  # noqa: E402

PICKS = {16: 0.03, 64: 0.01, 160: 0.01}
BETAS = [0.0, 0.1, 0.2, 0.3]
SEEDS = o.REPORT_SEEDS

if __name__ == "__main__":
    out = ["# 2g: outer lr 1.0, Nesterov momentum grid, inner lr = 2e's pick; half B, seeds %s; beta=0 recomputed here (deterministic, should equal 2e)" % SEEDS,
           "# H inner_lr beta mean sd paired_diff_vs_beta0 paired_sd seeds"]
    with Pool(4) as pool:
        for H, ilr in PICKS.items():
            res = {}
            for b in BETAS:
                res[b] = np.array(pool.map(o.run, [(s, H, ilr, 1.0, b, "B") for s in SEEDS]))
            for b in BETAS:
                d = res[b] - res[0.0]
                out.append("%d %g %g %.4f %.4f %+.4f %.4f %s" % (H, ilr, b, res[b].mean(), res[b].std(ddof=1), d.mean(),
                           d.std(ddof=1) if b else 0.0, " ".join("%.4f" % x for x in res[b])))
                print(out[-1], flush=True)
    open(os.path.join(here, "fine_momentum_sweep_results.txt"), "w").write("\n".join(out) + "\n")
