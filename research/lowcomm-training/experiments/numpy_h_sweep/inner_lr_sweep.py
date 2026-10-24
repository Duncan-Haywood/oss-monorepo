"""Held-out loss against sync interval H with plain-averaging outer step and inner lr tuned per H (LOG.md, Milestone 2e).

Half A of the held-out text picks the inner lr (seeds 100, 101); half B reports it (seeds 0..4).
"""
import os
import sys
from multiprocessing import Pool
import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from lowcomm_np import model, diloco, data  # noqa: E402

M, B, T, STEPS = 4, 16, 32, 640
HS = [0, 1, 4, 16, 64, 160]  # 0 = synchronous AdamW, batch M*B
INNER_LRS = [1e-3, 3e-3, 1e-2, 3e-2]
TUNE_SEEDS, REPORT_SEEDS = [100, 101], [0, 1, 2, 3, 4]
corpus, chars = data.load_chars(os.path.join(here, "..", "tinyshakespeare.txt"))
cut = int(0.9 * len(corpus))
train, val = corpus[:cut], corpus[cut:]
half = len(val) // 2
cfg = model.Config(vocab=len(chars), ctx=T, d=32, ff=64)
VA = data.batch(val[:half], 12345, 0, 0, 256, T)
VB = data.batch(val[half:], 12345, 0, 0, 256, T)


def run(args):
    seed, H, ilr, which = args
    theta0 = model.init(cfg, seed)
    gf = lambda m, s, th: model.loss_and_grad(cfg, th, *data.batch(train, seed, m, s, B, T))  # noqa: E731
    mk = lambda n: diloco.AdamW(n, ilr)  # noqa: E731
    if H == 0:
        th = diloco.sync_train(theta0, gf, M, STEPS, mk(len(theta0)))
    else:
        th = diloco.diloco_train(theta0, gf, M, H, STEPS // H, mk, 1.0, 0.0, "nesterov")
    v = VA if which == "A" else VB
    l = model.loss(cfg, th, *v)
    return l if np.isfinite(l) else np.inf


if __name__ == "__main__":
    out = ["# inner-lr sweep, outer = plain averaging (lr 1, momentum 0): M=%d, %d steps/worker, params=%d; tune on half A (seeds %s), report on half B (seeds %s)"
           % (M, STEPS, model.n_params(cfg), TUNE_SEEDS, REPORT_SEEDS), "## tuning: H inner_lr mean_halfA_loss"]
    picks = {}
    with Pool(4) as pool:
        for H in HS:
            res = pool.map(run, [(s, H, lr, "A") for lr in INNER_LRS for s in TUNE_SEEDS])
            means = np.array(res).reshape(len(INNER_LRS), len(TUNE_SEEDS)).mean(1)
            for lr, m in zip(INNER_LRS, means):
                out.append("%d %g %.4f" % (H, lr, m))
            picks[H] = INNER_LRS[int(np.argmin(means))]
            print("H=%d pick inner_lr=%g" % (H, picks[H]), flush=True)
        out.append("## report: H inner_lr mean_halfB sd seeds")
        for H in HS:
            r = pool.map(run, [(s, H, picks[H], "B") for s in REPORT_SEEDS])
            out.append("%d %g %.4f %.4f %s" % (H, picks[H], np.mean(r), np.std(r, ddof=1), " ".join("%.4f" % x for x in r)))
            print(out[-1], flush=True)
    open(os.path.join(here, "inner_lr_sweep_results.txt"), "w").write("\n".join(out) + "\n")
