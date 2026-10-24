"""Milestone 2f (LOG.md): inner lr grid extended to 0.1, then outer momentum on top of a tuned inner lr.

Half A of the held-out text picks the configuration (seeds 100, 101); half B reports it (seeds 0..4).
Part 1 reuses 2e's half-A numbers for inner lr 1e-3..3e-2 (read from inner_lr_sweep_results.txt; the runs are deterministic).
"""
import os
import sys
from multiprocessing import Pool
import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from lowcomm_np import model, diloco, data  # noqa: E402

M, B, T, STEPS = 4, 16, 32, 640
HS = [0, 1, 4, 16, 64, 160]
TUNE_SEEDS, REPORT_SEEDS = [100, 101], [0, 1, 2, 3, 4]
OUTERS = [(1.0, 0.0), (0.7, 0.9), (1.0, 0.5)]
P2_H, P2_LRS = [16, 64, 160], [1e-2, 3e-2, 1e-1]
corpus, chars = data.load_chars(os.path.join(here, "..", "tinyshakespeare.txt"))
cut = int(0.9 * len(corpus))
train, val = corpus[:cut], corpus[cut:]
half = len(val) // 2
cfg = model.Config(vocab=len(chars), ctx=T, d=32, ff=64)
VA = data.batch(val[:half], 12345, 0, 0, 256, T)
VB = data.batch(val[half:], 12345, 0, 0, 256, T)


def run(args):
    seed, H, ilr, olr, ob, which = args
    theta0 = model.init(cfg, seed)
    gf = lambda m, s, th: model.loss_and_grad(cfg, th, *data.batch(train, seed, m, s, B, T))  # noqa: E731
    mk = lambda n: diloco.AdamW(n, ilr)  # noqa: E731
    if H == 0:
        th = diloco.sync_train(theta0, gf, M, STEPS, mk(len(theta0)))
    else:
        th = diloco.diloco_train(theta0, gf, M, H, STEPS // H, mk, olr, ob, "nesterov")
    l = model.loss(cfg, th, *(VA if which == "A" else VB))
    return l if np.isfinite(l) else np.inf


def prior_half_a():
    d = {}
    for line in open(os.path.join(here, "inner_lr_sweep_results.txt")):
        if line.startswith("## report"):
            break
        if line[0] != "#":
            H, lr, m = line.split()
            d[(int(H), float(lr))] = float(m)
    return d


def tune(pool, cfgs):
    """cfgs: list of (H, ilr, olr, ob); returns mean half-A loss per cfg."""
    res = pool.map(run, [(s, H, ilr, olr, ob, "A") for (H, ilr, olr, ob) in cfgs for s in TUNE_SEEDS])
    return np.array(res).reshape(len(cfgs), len(TUNE_SEEDS)).mean(1)


def report(pool, out, label, H, ilr, olr, ob):
    r = pool.map(run, [(s, H, ilr, olr, ob, "B") for s in REPORT_SEEDS])
    out.append("%s H=%d inner_lr=%g outer=(%g,%g) halfB %.4f sd %.4f seeds %s"
               % (label, H, ilr, olr, ob, np.mean(r), np.std(r, ddof=1), " ".join("%.4f" % x for x in r)))
    print(out[-1], flush=True)


if __name__ == "__main__":
    prior = prior_half_a()
    out = ["# 2f: M=%d, %d steps/worker, params=%d; tune on half A (seeds %s), report on half B (seeds %s)"
           % (M, STEPS, model.n_params(cfg), TUNE_SEEDS, REPORT_SEEDS), "## part 1 tuning: H inner_lr mean_halfA (0.1 new; others from 2e)"]
    with Pool(4) as pool:
        picks1 = {}
        for H in HS:
            new = tune(pool, [(H, 0.1, 1.0, 0.0)])[0]
            grid = {lr: prior[(H, lr)] for lr in (1e-3, 3e-3, 1e-2, 3e-2)}
            grid[0.1] = new
            for lr, m in sorted(grid.items()):
                out.append("%d %g %.4f" % (H, lr, m))
            picks1[H] = min(grid, key=grid.get)
            print("part1 H=%d pick %g (0.1 -> %.4f)" % (H, picks1[H], new), flush=True)
        out.append("## part 1 report (half B, plain averaging): only for H whose pick is 0.1 (others are 2e's rows)")
        for H in HS:
            if picks1[H] == 0.1:
                report(pool, out, "p1", H, 0.1, 1.0, 0.0)
        out.append("## part 2 tuning: H outer_lr outer_beta inner_lr mean_halfA")
        for H in P2_H:
            cfgs = [(H, ilr, olr, ob) for (olr, ob) in OUTERS[1:] for ilr in P2_LRS]
            means = tune(pool, cfgs)
            for c, m in zip(cfgs, means):
                out.append("%d %g %g %g %.4f" % (c[0], c[2], c[3], c[1], m))
            for (olr, ob) in OUTERS[1:]:
                sel = [(m, c) for c, m in zip(cfgs, means) if c[2] == olr and c[3] == ob]
                m, c = min(sel)
                print("part2 H=%d outer=(%g,%g) pick inner %g half-A %.4f" % (H, olr, ob, c[1], m), flush=True)
                report(pool, out, "p2", H, c[1], olr, ob)
    open(os.path.join(here, "outer_momentum_sweep_results.txt"), "w").write("\n".join(out) + "\n")
