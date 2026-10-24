"""Bootstrap intervals for B_simple along synchronous training (see LOG.md, Milestone 2d)."""
import os
import sys
import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from lowcomm_np import model, diloco, data  # noqa: E402

M, B, T, STEPS = 4, 16, 32, 640
CKPTS, NB, SEEDS, NBOOT = [0, 80, 160, 320, 640], 256, [0, 1, 2], 1000
corpus, chars = data.load_chars(os.path.join(here, "..", "tinyshakespeare.txt"))
train = corpus[:int(0.9 * len(corpus))]
cfg = model.Config(vocab=len(chars), ctx=T, d=32, ff=64)


def est(gs, b=B):
    n = len(gs)
    S = gs.var(axis=0, ddof=1).sum()
    g2 = float(np.sum(gs.mean(0) ** 2) - S / n)
    return b * S, g2


def b_boot(theta, seed, rng):
    gs = np.array([model.loss_and_grad(cfg, theta, *data.batch(train, 10_000 + seed, 99, i, B, T))[1] for i in range(NB)])
    tr, g2 = est(gs)
    vals, bad = [], 0
    for _ in range(NBOOT):
        t, g = est(gs[rng.integers(0, NB, NB)])
        if g > 0:
            vals.append(t / g)
        else:
            bad += 1
    lo, hi = np.percentile(vals, [2.5, 97.5])
    return tr, g2, (tr / g2 if g2 > 0 else float("nan")), lo, hi, bad


if __name__ == "__main__":
    out = ["# B_simple with 95%% bootstrap intervals: n=%d batches of b=%d per estimate, %d resamples" % (NB, B, NBOOT),
           "# seed step trSigma G2_unbiased B_simple lo95 hi95 resamples_with_G2<=0"]
    for seed in SEEDS:
        theta = model.init(cfg, seed)
        rng = np.random.default_rng(seed)
        gf = lambda m, s, th: model.loss_and_grad(cfg, th, *data.batch(train, seed, m, s, B, T))  # noqa: E731
        opt = diloco.AdamW(len(theta), 3e-3)
        for step in range(STEPS + 1):
            if step in CKPTS:
                out.append("%d %d %.4g %.4g %.4g %.4g %.4g %d" % ((seed, step) + b_boot(theta, seed, rng)))
                print(out[-1], flush=True)
            if step < STEPS:
                theta = opt.step(theta, np.mean([gf(m, step, theta)[1] for m in range(M)], axis=0))
    open(os.path.join(here, "noise_scale_boot_results.txt"), "w").write("\n".join(out) + "\n")
