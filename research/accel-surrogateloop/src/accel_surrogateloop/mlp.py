"""Small MLP in NumPy with Adam, plus symmetric per-tensor post-training and straight-through
quantisation-aware training. Weights quantised to `wbits`; activations fake-quantised to 8 bits."""
import numpy as np


def init(rng, sizes):
    return [(rng.normal(0, np.sqrt(2.0 / a), (a, b)), np.zeros(b)) for a, b in zip(sizes[:-1], sizes[1:])]


def qw(w, bits):
    if bits is None:
        return w
    qmax = 2 ** (bits - 1) - 1
    s = np.max(np.abs(w)) / qmax
    if s == 0:
        return w
    return np.clip(np.round(w / s), -qmax, qmax) * s


def qa(x, bits=8):
    m = np.max(np.abs(x))
    if m == 0:
        return x
    qmax = 2 ** (bits - 1) - 1
    s = m / qmax
    return np.round(x / s) * s


def forward(params, X, wbits=None, abits=None, cache=False):
    a = X
    acts = [a]
    for i, (W, b) in enumerate(params):
        z = a @ qw(W, wbits) + b
        a = np.maximum(z, 0) if i < len(params) - 1 else z
        if abits and i < len(params) - 1:
            a = qa(a, abits)
        acts.append(a)
    return (a, acts) if cache else a


def train(params, X, y, rng, epochs=300, lr=3e-3, batch=64, wbits=None):
    """wbits=None: float training; wbits=k: straight-through QAT."""
    m = [(np.zeros_like(W), np.zeros_like(b)) for W, b in params]
    v = [(np.zeros_like(W), np.zeros_like(b)) for W, b in params]
    t = 0
    n = len(X)
    for _ in range(epochs):
        idx = rng.permutation(n)
        for s in range(0, n, batch):
            j = idx[s:s + batch]
            out, acts = forward(params, X[j], wbits=wbits, cache=True)
            g = 2 * (out - y[j]) / len(j)
            t += 1
            for i in range(len(params) - 1, -1, -1):
                W, b = params[i]
                gW = acts[i].T @ g
                gb = g.sum(0)
                if i > 0:
                    g = (g @ qw(W, wbits).T) * (acts[i] > 0)
                for k, (p, gr) in enumerate(((W, gW), (b, gb))):
                    m[i][k][...] = 0.9 * m[i][k] + 0.1 * gr
                    v[i][k][...] = 0.999 * v[i][k] + 0.001 * gr ** 2
                    p -= lr * (m[i][k] / (1 - 0.9 ** t)) / (np.sqrt(v[i][k] / (1 - 0.999 ** t)) + 1e-8)
    return params


def copy(params):
    return [(W.copy(), b.copy()) for W, b in params]
