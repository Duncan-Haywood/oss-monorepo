"""Simple gradient noise scale B_simple along synchronous training (see LOG.md, Milestone 2c)."""
import os
import sys
import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from lowcomm_np import model, diloco, data  # noqa: E402

M, B, T, STEPS = 4, 16, 32, 640
CKPTS, NB, SEEDS = [0, 80, 160, 320, 640], 64, [0, 1, 2]
corpus, chars = data.load_chars(os.path.join(here, "..", "tinyshakespeare.txt"))
train = corpus[:int(0.9 * len(corpus))]
cfg = model.Config(vocab=len(chars), ctx=T, d=32, ff=64)


def b_simple(theta, seed, b=B, n=NB):
    gs = np.array([model.loss_and_grad(cfg, theta, *data.batch(train, 10_000 + seed, 99, i, b, T))[1] for i in range(n)])
    S = gs.var(axis=0, ddof=1).sum()
    g2 = float(np.sum(gs.mean(0) ** 2) - S / n)
    return float(b * S), g2, (float(b * S) / g2 if g2 > 0 else float("nan"))


if __name__ == "__main__":
    out = ["# B_simple along sync AdamW training: M=%d x batch %d (=%d seqs/step), b=%d, n=%d batches per estimate"
           % (M, B, M * B, B, NB), "# seed step trSigma G2_unbiased B_simple"]
    for seed in SEEDS:
        theta = model.init(cfg, seed)
        gf = lambda m, s, th: model.loss_and_grad(cfg, th, *data.batch(train, seed, m, s, B, T))  # noqa: E731
        opt = diloco.AdamW(len(theta), 3e-3)
        for step in range(STEPS + 1):
            if step in CKPTS:
                out.append("%d %d %.4g %.4g %.4g" % ((seed, step) + b_simple(theta, seed)))
                print(out[-1], flush=True)
            if step < STEPS:
                theta = opt.step(theta, np.mean([gf(m, step, theta)[1] for m in range(M)], axis=0))
    open(os.path.join(here, "noise_scale_results.txt"), "w").write("\n".join(out) + "\n")
