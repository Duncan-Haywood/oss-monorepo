"""Simulated M-worker DiLoCo (Douillard et al., 2023, arXiv:2311.08105) in one process.

Round: every worker copies the global parameters, runs H inner steps with its own inner optimiser (state kept
across rounds, as in DiLoCo) on its own data stream; the pseudo-gradient is global minus the mean of the workers'
end points; the outer optimiser takes one step with it. Communication is modelled, not timed.

`loss_fn(model, rng)` returns a scalar loss for one inner step, drawing its data from the generator `rng`, which
is the worker's own. This keeps the engine independent of the model: the same code runs a transformer and the
quadratic of the closed-form check.
"""
import copy
import math

import torch


class DiLoCo:
    def __init__(self, model, loss_fn, workers=4, H=16, inner=None, outer=None, seed=0, compress=None, error_feedback=False, aggregate="mean", attack=None):
        """inner(params) and outer(params) build torch optimisers; defaults are DiLoCo's AdamW and Nesterov SGD.
        compress(delta, gen) -> tensor, optional: applied to each worker's per-tensor delta (global minus its end point)
        before averaging, with `gen` a torch.Generator owned by the engine. None leaves the round unchanged.
        error_feedback: each worker keeps the residual (input minus compressed) per tensor and adds it to the next round's
        delta before compressing (Seide et al. 2014; Stich et al. 2018), so a biased compressor such as top_k loses nothing for good.
        aggregate: "mean" (default), "median", the coordinate-wise median of the workers' deltas, or "trimmed", the coordinate-wise
        mean after dropping the lowest and the highest value (needs at least 3 workers) (Yin et al. 2018).
        attack(delta, worker_index) -> tensor, optional: replaces worker j's delta before aggregation (a Byzantine worker).
        Both apply on the uncompressed path only."""
        self.aggregate, self.attack = aggregate, attack
        inner = inner or (lambda p: torch.optim.AdamW(p, lr=1e-3, betas=(0.9, 0.95), weight_decay=0.0))
        outer = outer or (lambda p: torch.optim.SGD(p, lr=0.7, momentum=0.9, nesterov=True))
        self.model, self.loss_fn, self.H, self.rounds = model, loss_fn, H, 0
        self.workers = [copy.deepcopy(model) for _ in range(workers)]
        self.inner = [inner(w.parameters()) for w in self.workers]
        self.outer = outer(model.parameters())
        self.ef = [[torch.zeros_like(p.data) for p in w.parameters()] for w in self.workers] if error_feedback else None
        self.ef_norms = []  # per round: sqrt(sum ||residual||^2 / sum ||delta + residual||^2) over workers and tensors (EF only)
        self.compress, self.cgen = compress, torch.Generator().manual_seed(seed * 1000 + 777)
        self.rngs = [torch.Generator().manual_seed(seed * 1000 + 1 + i) for i in range(workers)]

    def round(self):
        """One communication round: returns the mean inner-step loss of the round."""
        g = list(self.model.parameters())
        for w in self.workers:
            w.load_state_dict(self.model.state_dict())
        total = 0.0
        for w, opt, rng in zip(self.workers, self.inner, self.rngs):
            for _ in range(self.H):
                opt.zero_grad(set_to_none=True)
                loss = self.loss_fn(w, rng)
                loss.backward()
                opt.step()
                total += loss.item()
        num = den = 0.0
        with torch.no_grad():
            for i, p in enumerate(g):
                if self.aggregate != "mean" or self.attack is not None:
                    ds = torch.stack([p.data - list(w.parameters())[i].data for w in self.workers])
                    if self.attack is not None:
                        if getattr(self.attack, "collective", False):
                            ds = self.attack(ds)  # sees every worker's delta (a coordinated coalition)
                        else:
                            ds = torch.stack([self.attack(d, j) for j, d in enumerate(ds)])
                    if self.aggregate == "median":
                        p.grad = ds.sort(0).values[(len(ds) - 1) // 2: len(ds) // 2 + 1].mean(0)
                    elif self.aggregate == "trimmed":
                        p.grad = ds.sort(0).values[1:-1].mean(0)
                    else:
                        p.grad = ds.mean(0)
                elif self.compress is None:
                    avg = torch.stack([list(w.parameters())[i] for w in self.workers]).mean(0)
                    p.grad = p.data - avg
                else:
                    outs = []
                    for j, w in enumerate(self.workers):
                        d = p.data - list(w.parameters())[i].data
                        if self.ef is not None:
                            d = d + self.ef[j][i]
                        c = self.compress(d, self.cgen)
                        if self.ef is not None:
                            self.ef[j][i] = d - c
                            num += self.ef[j][i].pow(2).sum().item()
                            den += d.pow(2).sum().item()
                        outs.append(c)
                    p.grad = torch.stack(outs).mean(0)
        if self.ef is not None and self.compress is not None:
            self.ef_norms.append((num / den) ** 0.5 if den > 0 else 0.0)
        self.outer.step()
        self.outer.zero_grad(set_to_none=True)
        self.rounds += 1
        return total / (self.H * len(self.workers))


def train_sync(model, loss_fn, steps, inner=None, seed=0):
    """The synchronous reference: one worker, one optimiser, no outer step. At M = 1, H = 1 and an outer SGD of
    learning rate 1 without momentum, DiLoCo reduces to this."""
    inner = inner or (lambda p: torch.optim.AdamW(p, lr=1e-3, betas=(0.9, 0.95), weight_decay=0.0))
    opt, rng, losses = inner(model.parameters()), torch.Generator().manual_seed(seed * 1000 + 1), []
    for _ in range(steps):
        opt.zero_grad(set_to_none=True)
        loss = loss_fn(model, rng)
        loss.backward()
        opt.step()
        losses.append(loss.item())
    return losses


def rand_k(keep):
    """Unbiased random sparsifier: keep each coordinate with probability `keep`, scale survivors by 1/keep.
    E[C(x)] = x and E||C(x) - x||^2 = omega ||x||^2 with omega = 1/keep - 1 (Stich 2018; Beznosikov et al. 2020)."""
    def c(x, gen):
        mask = (torch.rand(x.shape, generator=gen) < keep).to(x.dtype)
        return x * mask / keep
    return c


def top_k(keep):
    """Biased top-k sparsifier per tensor: keep the ceil(keep * n) largest-magnitude coordinates, zero the rest (no
    rescaling). Contractive: ||C(x) - x||^2 <= (1 - keep) ||x||^2 (Stich et al. 2018)."""
    def c(x, gen):
        k = max(1, math.ceil(keep * x.numel()))
        idx = x.abs().flatten().topk(k).indices
        out = torch.zeros_like(x).flatten()
        out[idx] = x.flatten()[idx]
        return out.view_as(x)
    return c


def quantise(levels):
    """Unbiased stochastic uniform quantiser per tensor (QSGD-style, Alistarh et al. 2017): scale by the tensor's max
    magnitude s, map |x|/s onto `levels` equal steps and round up with probability equal to the fractional part, so
    E[C(x)] = x. `levels` = 1 gives ternary values {-s, 0, s}; 7 fits a signed 4-bit code (15 values)."""
    def c(x, gen):
        s = x.abs().max()
        if s == 0:
            return x.clone()
        y = x.abs() / s * levels
        low = y.floor()
        up = (torch.rand(x.shape, generator=gen) < (y - low)).to(x.dtype)
        return torch.sign(x) * (low + up) * s / levels
    return c


def quantize(bits, stochastic=True):
    """Per-tensor uniform quantiser with 2^bits - 1 levels on [-max|x|, max|x|] (QSGD-style, Alistarh et al. 2017).
    Stochastic rounding makes it unbiased: E[C(x)] = x. bits = 1 is the scaled sign, C(x) = mean|x| sign(x) (Seide et
    al. 2014; Karimireddy et al. 2019), which is biased and meant for error feedback."""
    def c(x, gen):
        if bits == 1:
            return x.abs().mean() * torch.sign(x)
        s = x.abs().max()
        if s == 0:
            return x
        L = 2 ** (bits - 1) - 1
        y = x / s * L
        lo = y.floor()
        up = (torch.rand(x.shape, generator=gen) < (y - lo)) if stochastic else ((y - lo) >= 0.5)
        return (lo + up.to(x.dtype)) * s / L
    return c
