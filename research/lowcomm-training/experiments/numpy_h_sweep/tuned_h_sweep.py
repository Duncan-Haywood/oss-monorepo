"""Held-out loss against sync interval H with the outer optimiser tuned per H (see LOG.md, Milestone 2a).

Half A of the held-out text picks the outer setting (seeds 100, 101); half B reports it (seeds 0..4).
"""
import itertools
import os
import sys
from multiprocessing import Pool
import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from lowcomm_np import model, diloco, data  # noqa: E402

M, B, T, STEPS = 4, 16, 32, 640
HS = [1, 4, 16, 64, 160]
WIDE = "--wide" in sys.argv  # Milestone 2b: lr grid extended beyond 1.0
LRS, BETAS = ([0.7, 1.0, 1.5, 2.0, 3.0] if WIDE else [0.3, 0.7, 1.0]), [0.0, 0.5, 0.9]
TUNE_SEEDS, REPORT_SEEDS = [100, 101], [0, 1, 2, 3, 4]
corpus, chars = data.load_chars(os.path.join(here, "..", "tinyshakespeare.txt"))
cut = int(0.9 * len(corpus))
train, val = corpus[:cut], corpus[cut:]
half = len(val) // 2
cfg = model.Config(vocab=len(chars), ctx=T, d=32, ff=64)
VA = data.batch(val[:half], 12345, 0, 0, 256, T)
VB = data.batch(val[half:], 12345, 0, 0, 256, T)


def run(args):
    seed, H, lr, beta, which = args
    theta0 = model.init(cfg, seed)
    gf = lambda m, s, th: model.loss_and_grad(cfg, th, *data.batch(train, seed, m, s, B, T))  # noqa: E731
    mk = lambda n: diloco.AdamW(n, 3e-3)  # noqa: E731
    if H == 0:
        th = diloco.sync_train(theta0, gf, M, STEPS, mk(len(theta0)))
    else:
        th = diloco.diloco_train(theta0, gf, M, H, STEPS // H, mk, lr, beta, "nesterov")
    v = VA if which == "A" else VB
    return model.loss(cfg, th, *v)


if __name__ == "__main__":
    out = ["# tuned-outer H sweep: M=%d, %d inner steps/worker, params=%d; tune on half A (seeds %s), report on half B (seeds %s)"
           % (M, STEPS, model.n_params(cfg), TUNE_SEEDS, REPORT_SEEDS)]
    with Pool(4) as pool:
        out.append("## tuning grid: H lr beta mean_halfA_loss")
        picks = {}
        for H in HS:
            grid = list(itertools.product(LRS, BETAS))
            res = pool.map(run, [(s, H, lr, b, "A") for lr, b in grid for s in TUNE_SEEDS])
            means = np.array(res).reshape(len(grid), len(TUNE_SEEDS)).mean(1)
            for (lr, b), m in zip(grid, means):
                out.append("%d %.1f %.1f %.4f" % (H, lr, b, m))
            picks[H] = grid[int(np.nanargmin(np.where(np.isfinite(means), means, np.inf)))]
            print("H=%d pick lr=%.1f beta=%.1f" % ((H,) + picks[H]), flush=True)
        out.append("## report: H lr beta mean_halfB sd seeds")
        r = pool.map(run, [(s, 0, 0, 0, "B") for s in REPORT_SEEDS])
        out.append("0 - - %.4f %.4f %s" % (np.mean(r), np.std(r, ddof=1), " ".join("%.4f" % x for x in r)))
        for H in HS:
            lr, b = picks[H]
            r = pool.map(run, [(s, H, lr, b, "B") for s in REPORT_SEEDS])
            out.append("%d %.1f %.1f %.4f %.4f %s" % (H, lr, b, np.mean(r), np.std(r, ddof=1), " ".join("%.4f" % x for x in r)))
            print(out[-1], flush=True)
    open(os.path.join(here, "tuned_h_sweep_wide_results.txt" if WIDE else "tuned_h_sweep_results.txt"), "w").write("\n".join(out) + "\n")
