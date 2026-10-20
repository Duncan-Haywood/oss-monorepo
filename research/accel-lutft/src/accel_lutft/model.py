"""NumPy MLP with straight-through weight quantisers and pruning masks (copied from research/accel-lut, itself copied from accel-sparse; MIT; self-contained)."""
import numpy as np


def q_uniform(w, bits):
    """Symmetric per-tensor uniform quantiser to `bits` bits (bits>=2), power-free scale."""
    qmax = 2 ** (bits - 1) - 1
    s = np.max(np.abs(w)) / qmax + 1e-12
    return np.clip(np.round(w / s), -qmax, qmax) * s


def q_ternary(w):
    """Ternary weights {-a, 0, +a} with threshold 0.7*mean|w| (Li and Liu 2016 rule of thumb)."""
    d = 0.7 * np.mean(np.abs(w))
    m = np.abs(w) > d
    a = np.mean(np.abs(w[m])) if m.any() else 0.0
    return np.sign(w) * m * a


def q_binary(w):
    return np.sign(w + 1e-12) * np.mean(np.abs(w))


def make_quant(kind):
    if kind == 'float':
        return lambda w: w
    if kind == 'ternary':
        return q_ternary
    if kind == 'binary':
        return q_binary
    if kind.startswith('int'):
        b = int(kind[3:])
        return lambda w: q_uniform(w, b)
    raise ValueError(kind)


def init(sizes, rng):
    return [[rng.normal(0, np.sqrt(2.0 / i), (i, o)), np.zeros(o)] for i, o in zip(sizes[:-1], sizes[1:])]


def forward(params, x, quant, masks, act_bits=None, act_scales=None):
    a = x
    caches = []
    n = len(params)
    for k, (w, b) in enumerate(params):
        wq = quant(w) * masks[k]
        z = a @ wq + b
        caches.append((a, wq))
        if k < n - 1:
            a = np.maximum(z, 0)
            if act_bits is not None:
                s = act_scales[k]
                qm = 2 ** act_bits - 1
                a = np.clip(np.round(a / s), 0, qm) * s
        else:
            a = z
    return a, caches


def train(params, x, y, masks, quant, epochs, rng, lr=3e-3, bs=64, prune_to=None, prune_from=0, prune_until=0):
    """Adam with straight-through gradients.  If prune_to is given, per-layer magnitude pruning
    raises sparsity linearly (cubic schedule) from epoch prune_from to prune_until."""
    m = [[np.zeros_like(p) for p in l] for l in params]
    v = [[np.zeros_like(p) for p in l] for l in params]
    t = 0
    n = len(x)
    for ep in range(epochs):
        if prune_to is not None and ep >= prune_from:
            f = min(1.0, (ep - prune_from + 1) / max(1, prune_until - prune_from))
            sp = prune_to * (1 - (1 - f) ** 3)
            for k, (w, _) in enumerate(params):
                if sp > 0:
                    thr = np.quantile(np.abs(w).ravel(), sp)  # pruned latent weights are held at 0
                    masks[k] = (np.abs(w) > thr).astype(float) * masks[k]
                    w *= masks[k]
        perm = rng.permutation(n)
        for i in range(0, n, bs):
            idx = perm[i:i + bs]
            logits, caches = forward(params, x[idx], quant, masks)
            p = np.exp(logits - logits.max(1, keepdims=True))
            p /= p.sum(1, keepdims=True)
            g = p
            g[np.arange(len(idx)), y[idx]] -= 1
            g /= len(idx)
            grads = [None] * len(params)
            for k in range(len(params) - 1, -1, -1):
                a, wq = caches[k]
                grads[k] = (a.T @ g * masks[k], g.sum(0))  # straight-through to the latent weights
                if k > 0:
                    g = (g @ wq.T) * (caches[k][0] > 0)
            t += 1
            for k in range(len(params)):
                for j in range(2):
                    m[k][j] = 0.9 * m[k][j] + 0.1 * grads[k][j]
                    v[k][j] = 0.999 * v[k][j] + 0.001 * grads[k][j] ** 2
                    mh = m[k][j] / (1 - 0.9 ** t)
                    vh = v[k][j] / (1 - 0.999 ** t)
                    params[k][j] -= lr * mh / (np.sqrt(vh) + 1e-8)
                if prune_to is not None:
                    params[k][0] *= masks[k]
    return params, masks


def act_scales_from(params, x, quant, masks, act_bits):
    a = x
    out = []
    for k, (w, b) in enumerate(params[:-1]):
        a = np.maximum(a @ (quant(w) * masks[k]) + b, 0)
        s = a.max() / (2 ** act_bits - 1) + 1e-12
        out.append(s)
        a = np.clip(np.round(a / s), 0, 2 ** act_bits - 1) * s
    return out


def accuracy(params, x, y, quant, masks, act_bits=8, act_scales=None):
    lo, _ = forward(params, x, quant, masks, act_bits, act_scales)
    return float(np.mean(lo.argmax(1) == y))


def nnz_per_layer(params, quant, masks):
    return [int(np.count_nonzero(quant(w) * masks[k])) for k, (w, _) in enumerate(params)]
