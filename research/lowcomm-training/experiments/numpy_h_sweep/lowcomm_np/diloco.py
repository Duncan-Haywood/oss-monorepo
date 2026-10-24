"""Simulated M-worker DiLoCo on a flat parameter vector (communication is modelled, not timed).
A round: every worker starts from the global parameters theta, runs H inner steps on its own batches with its own
persistent inner optimiser state, and the pseudo-gradient is  g = theta - mean_m(theta_m).  The outer optimiser then
updates theta from g:  'nesterov' (DiLoCo):  v <- b v + g;  theta <- theta - lr (g + b v)
                       'heavyball' (the quadratic projects):  v <- b v + g;  theta <- theta - lr v.
With M = 1, H = 1, lr = 1, b = 0 a round equals one step of the inner optimiser, which tests/ check against sync_train.
"""
import numpy as np

__all__ = ["AdamW", "SGD", "diloco_train", "sync_train", "outer_step"]


class AdamW:
    def __init__(self, n, lr, b1=0.9, b2=0.95, eps=1e-8, wd=0.0):
        self.lr, self.b1, self.b2, self.eps, self.wd = lr, b1, b2, eps, wd
        self.m, self.v, self.t = np.zeros(n), np.zeros(n), 0

    def step(self, theta, g):
        self.t += 1
        self.m = self.b1 * self.m + (1 - self.b1) * g
        self.v = self.b2 * self.v + (1 - self.b2) * g * g
        mh = self.m / (1 - self.b1 ** self.t)
        vh = self.v / (1 - self.b2 ** self.t)
        return theta - self.lr * (mh / (np.sqrt(vh) + self.eps) + self.wd * theta)


class SGD:
    def __init__(self, n, lr):
        self.lr = lr

    def step(self, theta, g):
        return theta - self.lr * g


def outer_step(theta, g, v, lr, beta, kind):
    v = beta * v + g
    return theta - lr * (g + beta * v if kind == "nesterov" else v), v


def diloco_train(theta0, grad_fn, M, H, rounds, make_inner, outer_lr=1.0, outer_beta=0.0, outer_kind="nesterov",
                 on_round=None):
    """grad_fn(worker, step_index, theta) -> (loss, grad) for that worker's next batch. Returns final theta.
    on_round(r, theta, mean_inner_loss) is called after each outer update."""
    theta = theta0.copy()
    inner = [make_inner(len(theta)) for _ in range(M)]
    v = np.zeros_like(theta)
    for r in range(rounds):
        ends, losses = [], []
        for m in range(M):
            th = theta.copy()
            for h in range(H):
                L, g = grad_fn(m, r * H + h, th)
                th = inner[m].step(th, g)
                losses.append(L)
            ends.append(th)
        g = theta - np.mean(ends, axis=0)
        theta, v = outer_step(theta, g, v, outer_lr, outer_beta, outer_kind)
        if on_round:
            on_round(r, theta, float(np.mean(losses)))
    return theta


def sync_train(theta0, grad_fn, M, steps, inner):
    """Synchronous data-parallel reference: average the M workers' gradients, one inner-optimiser step."""
    theta = theta0.copy()
    for s in range(steps):
        gs = [grad_fn(m, s, theta)[1] for m in range(M)]
        theta = inner.step(theta, np.mean(gs, axis=0))
    return theta
