"""Milestone 11: the margin measurement for a small causal transformer (needs torch).

Same referee and shortcut as `margin.py` / `margin_gen.py`: plain SGD with a cosine step size; a worker that
skips the steps whose referee-recomputed update has norm <= tau. The referee here is the same step recomputed
with the batch rows permuted (different float32 summation order) or in bfloat16 autocast. Character-level
language model on a text file; the data split is by position (last 20% held out)."""
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from .margin import bootstrap_ci, lr_at  # noqa: F401


class Block(nn.Module):
    def __init__(self, d, heads):
        super().__init__()
        self.ln1, self.ln2 = nn.LayerNorm(d), nn.LayerNorm(d)
        self.attn = nn.MultiheadAttention(d, heads, batch_first=True)
        self.mlp = nn.Sequential(nn.Linear(d, 4 * d), nn.GELU(), nn.Linear(4 * d, d))

    def forward(self, x, mask):
        h = self.ln1(x)
        x = x + self.attn(h, h, h, attn_mask=mask, need_weights=False)[0]
        return x + self.mlp(self.ln2(x))


class TinyLM(nn.Module):
    def __init__(self, vocab, ctx=32, d=32, heads=2, layers=2):
        super().__init__()
        self.emb, self.pos = nn.Embedding(vocab, d), nn.Embedding(ctx, d)
        self.blocks = nn.ModuleList(Block(d, heads) for _ in range(layers))
        self.ln, self.head = nn.LayerNorm(d), nn.Linear(d, vocab)
        self.register_buffer("mask", torch.triu(torch.ones(ctx, ctx, dtype=torch.bool), 1))

    def forward(self, x):
        h = self.emb(x) + self.pos(torch.arange(x.shape[1]))
        for b in self.blocks:
            h = b(h, self.mask[:x.shape[1], :x.shape[1]])
        return self.head(self.ln(h))


def load_text(path, ctx=32):
    raw = open(path, "rb").read()
    chars = sorted(set(raw))
    code = {c: i for i, c in enumerate(chars)}
    ids = torch.tensor([code[c] for c in raw])
    n = int(0.8 * len(ids))
    return ids[:n], ids[n:], len(chars)


def batch_at(ids, idx, ctx):
    x = torch.stack([ids[i:i + ctx] for i in idx])
    y = torch.stack([ids[i + 1:i + ctx + 1] for i in idx])
    return x, y


def grad_vec(model, x, y, bf16=False):
    model.zero_grad(set_to_none=True)
    if bf16:
        with torch.autocast("cpu", dtype=torch.bfloat16):
            out = model(x)
    else:
        out = model(x)
    F.cross_entropy(out.float().reshape(-1, out.shape[-1]), y.reshape(-1)).backward()
    return torch.cat([p.grad.reshape(-1) for p in model.parameters()])


@torch.no_grad()
def heldout(model, ids, ctx, n=512, seed=123):
    g = np.random.default_rng(seed)
    idx = g.integers(0, len(ids) - ctx - 1, n)
    x, y = batch_at(ids, idx, ctx)
    return float(F.cross_entropy(model(x).reshape(-1, model.head.out_features), y.reshape(-1)))


def train(data, seed, steps=600, batch=32, ctx=32, lr0=0.5, strategy=None, tau=0.0, referee="reorder", record=False):
    tr, te, vocab = data
    torch.manual_seed(seed)
    model = TinyLM(vocab, ctx)
    params = list(model.parameters())
    order = np.random.default_rng(10_000 + seed)
    perm = np.random.default_rng(20_000 + seed)
    cheated, norms, drifts, d_sub, d_stale = 0, [], [], [], []
    prev, prev_honest, chain, chains = None, False, 0, []
    for t in range(steps):
        idx = order.integers(0, len(tr) - ctx - 1, batch)
        x, y = batch_at(tr, idx, ctx)
        lr = lr_at(t, steps, lr0)
        g = grad_vec(model, x, y)
        step_norm = lr * float(g.norm())
        cheap = None
        if strategy == "subsample":  # a quarter of the batch: 4x cheaper gradient
            cheap = grad_vec(model, x[:batch // 4], y[:batch // 4])
        elif strategy == "stale":  # reuse last step's submitted gradient: no backward pass
            cheap = prev
        elif strategy == "stale1":  # as stale, but only an honestly computed gradient may be reused (no chains)
            cheap = prev if prev_honest else None
        if strategy is not None or record:
            p = torch.tensor(perm.permutation(batch))
            gr = grad_vec(model, x[p], y[p]) if referee == "reorder" else grad_vec(model, x, y, bf16=True)
            if record:
                norms.append(step_norm)
                drifts.append(lr * float((g - gr).norm()))
                d_sub.append(lr * float((grad_vec(model, x[:batch // 4], y[:batch // 4]) - gr).norm()))
                d_stale.append(lr * float((prev - gr).norm()) if prev is not None else float("inf"))
            if strategy == "skip" and lr * float(gr.norm()) <= tau:
                cheated += 1
                continue
            if cheap is not None and lr * float((cheap - gr).norm()) <= tau:
                cheated += 1
                g = cheap
                chain += 1
            else:
                if chain:
                    chains.append(chain)
                chain = 0
        prev = g
        prev_honest = strategy != "stale1" or chain == 0
        with torch.no_grad():
            off = 0
            for q in params:
                n = q.numel()
                q -= lr * g[off:off + n].view_as(q)
                off += n
    return model, {"cheated": cheated / steps, "norms": norms, "drifts": drifts, "dist_subsample": d_sub, "dist_stale": d_stale, "chains": chains + ([chain] if chain else [])}
