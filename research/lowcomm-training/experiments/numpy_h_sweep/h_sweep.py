"""Held-out loss against sync interval H at a fixed inner-step budget (smoke test of the harness; see LOG.md)."""
import os
import sys
import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from lowcomm_np import model, diloco, data  # noqa: E402

M, B, T, STEPS, SEEDS = 4, 16, 32, 640, 3
HS = [1, 4, 16, 64, 160]
corpus, chars = data.load_chars(os.path.join(here, "..", "tinyshakespeare.txt"))
cut = int(0.9 * len(corpus))
train, val = corpus[:cut], corpus[cut:]
cfg = model.Config(vocab=len(chars), ctx=T, d=32, ff=64)
VX, VY = data.batch(val, 12345, 0, 0, 256, T)


def run(seed, H):
    theta0 = model.init(cfg, seed)
    gf = lambda m, s, th: model.loss_and_grad(cfg, th, *data.batch(train, seed, m, s, B, T))  # noqa: E731
    mk = lambda n: diloco.AdamW(n, 3e-3)  # noqa: E731
    if H == 0:  # synchronous reference, M times the batch
        gs = lambda m, s, th: model.loss_and_grad(cfg, th, *data.batch(train, seed, m, s, B, T))  # noqa: E731
        th = diloco.sync_train(theta0, gs, M, STEPS, mk(len(theta0)))
    else:
        th = diloco.diloco_train(theta0, gf, M, H, STEPS // H, mk, 0.7, 0.9, "nesterov")
    return model.loss(cfg, th, VX, VY)


out = ["# held-out loss (nats/char), M=%d, %d inner steps per worker, %d seeds; H=0 is synchronous AdamW" % (M, STEPS, SEEDS),
       "# params=%d, uniform-guess loss ln(%d)=%.3f" % (model.n_params(cfg), len(chars), np.log(len(chars))),
       "H mean sd seeds"]
for H in [0] + HS:
    r = [run(s, H) for s in range(SEEDS)]
    line = "%d %.4f %.4f %s" % (H, np.mean(r), np.std(r, ddof=1), " ".join("%.4f" % x for x in r))
    print(line, flush=True)
    out.append(line)
open(os.path.join(here, "h_sweep_results.txt"), "w").write("\n".join(out) + "\n")
