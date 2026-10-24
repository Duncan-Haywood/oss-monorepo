"""Milestone 8: the margin measurement of `margin.py` for any-depth ReLU MLPs and any real dataset.

Same referee, same shortcuts and same seed pairing as `margin.py`; the model is a list of layer sizes and
the data a (train x, train y, test x, test y) tuple, so the milestone 3 result can be repeated on other
tasks (needs numpy). `margin.py` is left untouched so its recorded results stay reproducible."""
import numpy as np

from .margin import STRATEGIES, bootstrap_ci, lr_at, to_f16  # noqa: F401


def load(name, seed=0):
    """Real data shipped with scikit-learn, 70/30 split, features scaled to [0, 1] (digits) or standardised."""
    from sklearn import datasets
    d = {"digits": datasets.load_digits, "breast_cancer": datasets.load_breast_cancer, "wine": datasets.load_wine}[name]()
    x = d.data.astype(np.float64)
    x = x / 16.0 if name == "digits" else (x - x.mean(0)) / x.std(0)
    x, y = x.astype(np.float32), d.target
    idx = np.random.default_rng(seed).permutation(len(y))
    n = int(0.7 * len(y))
    return x[idx[:n]], y[idx[:n]], x[idx[n:]], y[idx[n:]]


def init(rng, sizes):
    parts = []
    for a, b in zip(sizes[:-1], sizes[1:]):
        parts += [(rng.standard_normal(a * b) * np.sqrt(2.0 / a)).astype(np.float32), np.zeros(b, np.float32)]
    return np.concatenate(parts)


def unpack(w, sizes):
    out, i = [], 0
    for a, b in zip(sizes[:-1], sizes[1:]):
        out.append((w[i:i + a * b].reshape(a, b), w[i + a * b:i + a * b + b]))
        i += a * b + b
    return out


def forward(w, sizes, x):
    zs, hs = [], [x]
    layers = unpack(w, sizes)
    for k, (m, b) in enumerate(layers):
        z = hs[-1] @ m + b
        zs.append(z)
        hs.append(np.maximum(z, 0) if k < len(layers) - 1 else z)
    return zs, hs


def grad(w, sizes, x, y, low_precision=False):
    if low_precision:
        w, x = to_f16(w), to_f16(x)
    layers = unpack(w, sizes)
    zs, hs = forward(w, sizes, x)
    o = hs[-1] - hs[-1].max(1, keepdims=True)
    p = np.exp(o)
    p /= p.sum(1, keepdims=True)
    p[np.arange(len(y)), y] -= 1
    d = p / len(y)
    parts = []
    for k in range(len(layers) - 1, -1, -1):
        m, _ = layers[k]
        parts = [(hs[k].T @ d).ravel(), d.sum(0)] + parts
        if k:
            d = (d @ m.T) * (zs[k - 1] > 0)
    return np.concatenate(parts).astype(np.float32)


def loss(w, sizes, x, y):
    o = forward(w, sizes, x)[1][-1]
    o = o - o.max(1, keepdims=True)
    return float(np.mean(np.log(np.exp(o).sum(1)) - o[np.arange(len(y)), y]))


def accuracy(w, sizes, x, y):
    return float(np.mean(forward(w, sizes, x)[1][-1].argmax(1) == y))


def train(data, sizes, seed, steps=1500, batch=64, lr0=0.2, strategy=None, tau=0.0, referee="reorder", record=False):
    """As `margin.train`, for the skip shortcut (strategy "skip") or honest (None)."""
    xtr, ytr, _, _ = data
    rng = np.random.default_rng(seed)
    w = init(rng, sizes)
    order_rng = np.random.default_rng(10_000 + seed)
    perm_rng = np.random.default_rng(20_000 + seed)
    cheated, norms, drifts = 0, [], []
    for t in range(steps):
        idx = order_rng.integers(0, len(ytr), batch)
        x, y = xtr[idx], ytr[idx]
        lr = lr_at(t, steps, lr0)
        d_honest = -lr * grad(w, sizes, x, y)
        step = d_honest
        if strategy is not None or record:
            perm = perm_rng.permutation(batch)
            d_ref = -lr * grad(w, sizes, x[perm], y[perm]) if referee == "reorder" else -lr * grad(w, sizes, x, y, True)
            if record:
                norms.append(float(np.linalg.norm(d_honest)))
                drifts.append(float(np.linalg.norm(d_honest - d_ref)))
            if strategy == "skip" and np.linalg.norm(d_ref) <= tau:
                step = np.zeros_like(w)
                cheated += 1
        w = w + step
    return w, {"cheated": cheated / steps, "norms": norms, "drifts": drifts}
