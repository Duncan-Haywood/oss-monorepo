"""Milestone 46 control: honest per-tensor growth. Clean runs of the same protocol (d = 32, 600 steps, 4 seeds); for each tensor the ratio of its
max|w| at the end to its max|w| at initialisation (zero-initialised tensors are listed separately: any ratio is infinite). A per-tensor bound
K x m_t with K below the largest honest ratio would reject honest work.   Run:  OMP_NUM_THREADS=1 python3 -W ignore growth.py"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import torch  # noqa: E402
from vtm.margin_tf import TinyLM, batch_at, grad_vec, load_text, lr_at  # noqa: E402

torch.set_num_threads(1)
SEEDS, STEPS, D, BATCH, CTX = 4, 600, 32, 32, 32
tr, te, vocab = load_text(os.path.join(HERE, "..", "transformer", "corpus.txt"))
rat, zero_final = [], []
for seed in range(SEEDS):
    torch.manual_seed(seed)
    model = TinyLM(vocab, CTX, d=D)
    params = list(model.parameters())
    m0 = np.array([float(p.detach().abs().max()) for p in params])
    order = np.random.default_rng(10_000 + seed)
    for t in range(STEPS):
        x, y = batch_at(tr, order.integers(0, len(tr) - CTX - 1, BATCH), CTX)
        g = grad_vec(model, x, y)
        lr = lr_at(t, STEPS, lr0=0.5)
        with torch.no_grad():
            off = 0
            for q in params:
                q -= lr * g[off:off + q.numel()].view_as(q)
                off += q.numel()
    m1 = np.array([float(p.detach().abs().max()) for p in params])
    nz = m0 > 0
    rat.append(m1[nz] / m0[nz]); zero_final.append(m1[~nz])
rat = np.concatenate(rat); zf = np.concatenate(zero_final)
L = ["tensors with nonzero init: %d (tensor x seed); final/init max|w| ratio: median %.2f, 90th pct %.2f, max %.2f; share above 1.5: %.2f, above 2: %.2f, above 4: %.2f" % (
    len(rat), np.median(rat), np.percentile(rat, 90), rat.max(), (rat > 1.5).mean(), (rat > 2).mean(), (rat > 4).mean()),
     "zero-init tensors: %d (tensor x seed); their final max|w|: median %.3f, max %.3f (global init max about 4)" % (len(zf), np.median(zf), zf.max())]
open(os.path.join(HERE, "growth.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
