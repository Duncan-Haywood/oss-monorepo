"""Full-batch L2-regularised logistic regression in emulated float32.

State = weight vector. One step: w <- w - lr*(grad + mu*w), where each gradient
coordinate and each logit is a float32 dot product under a chosen reduction
order. The strong convexity mu makes the map a contraction (factor ~ 1-lr*mu
near the optimum), which controls how per-step deviations accumulate.
"""
import math
import random
from dataclasses import dataclass

from .fp32 import f32, dot
from .merkle import MerkleTree


@dataclass
class Problem:
    X: list
    y: list
    lr: float = 0.5
    mu: float = 0.1

    @staticmethod
    def synthetic(n=64, d=8, seed=0, lr=0.5, mu=0.1):
        r = random.Random(seed)
        wt = [r.gauss(0, 1) for _ in range(d)]
        X = [[f32(r.gauss(0, 1)) for _ in range(d)] for _ in range(n)]
        y = [1.0 if sum(a * b for a, b in zip(x, wt)) + r.gauss(0, .5) > 0 else 0.0 for x in X]
        return Problem(X, y, lr, mu)


def _sigmoid(z):
    return f32(1.0 / (1.0 + math.exp(-z)))


def step(prob, w, order="canonical", rng=None):
    n, d = len(prob.X), len(w)
    resid = [f32(_sigmoid(dot(x, w, order, rng)) - t) for x, t in zip(prob.X, prob.y)]
    cols = [[x[j] for x in prob.X] for j in range(d)]
    out = []
    for j in range(d):
        g = f32(dot(cols[j], resid, order, rng) / n)
        out.append(f32(w[j] - f32(prob.lr * f32(g + f32(prob.mu * w[j])))))
    return out


def run_trace(prob, T, order="canonical", rng=None, w0=None):
    w = list(w0) if w0 is not None else [0.0] * len(prob.X[0])
    states = [w]
    for _ in range(T):
        w = step(prob, w, order, rng)
        states.append(w)
    return states


def commit(states):
    return MerkleTree(states)
