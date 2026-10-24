"""Simulated M-worker DiLoCo (Douillard et al., 2023, arXiv:2311.08105) in one process.

Round: every worker copies the global parameters, runs H inner steps with its own inner optimiser (state kept
across rounds, as in DiLoCo) on its own data stream; the pseudo-gradient is global minus the mean of the workers'
end points; the outer optimiser takes one step with it. Communication is modelled, not timed.

`loss_fn(model, rng)` returns a scalar loss for one inner step, drawing its data from the generator `rng`, which
is the worker's own. This keeps the engine independent of the model: the same code runs a transformer and the
quadratic of the closed-form check.
"""
import copy

import torch


class DiLoCo:
    def __init__(self, model, loss_fn, workers=4, H=16, inner=None, outer=None, seed=0):
        """inner(params) and outer(params) build torch optimisers; defaults are DiLoCo's AdamW and Nesterov SGD."""
        inner = inner or (lambda p: torch.optim.AdamW(p, lr=1e-3, betas=(0.9, 0.95), weight_decay=0.0))
        outer = outer or (lambda p: torch.optim.SGD(p, lr=0.7, momentum=0.9, nesterov=True))
        self.model, self.loss_fn, self.H, self.rounds = model, loss_fn, H, 0
        self.workers = [copy.deepcopy(model) for _ in range(workers)]
        self.inner = [inner(w.parameters()) for w in self.workers]
        self.outer = outer(model.parameters())
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
        with torch.no_grad():
            for i, p in enumerate(g):
                avg = torch.stack([list(w.parameters())[i] for w in self.workers]).mean(0)
                p.grad = p.data - avg
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
