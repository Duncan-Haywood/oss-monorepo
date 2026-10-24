"""Benign drift and the hidden margin of a tolerance-tau referee on real training (needs numpy).

A worker trains a small MLP by minibatch SGD in float32. A refereed check re-executes one step from
the worker's checkpoint and accepts when the L2 distance between the two next checkpoints is at most
tau. `cheat_when_cheap` workers pick, at every step, a cheaper alternative to the honest update and
use it whenever it passes that check, so a single-step audit cannot catch it by construction. The
question (H1) is whether the loss they give up is larger than seed-to-seed noise."""
import numpy as np

SIZES = (64, 64, 10)


def load_digits_split(seed=0):
    """Real data shipped with scikit-learn: 1,797 8x8 digit images, 70/30 split, scaled to [0, 1]."""
    from sklearn.datasets import load_digits
    d = load_digits()
    x = (d.data / 16.0).astype(np.float32)
    y = d.target
    idx = np.random.default_rng(seed).permutation(len(y))
    n = int(0.7 * len(y))
    return x[idx[:n]], y[idx[:n]], x[idx[n:]], y[idx[n:]]


def init(rng):
    a, h, c = SIZES
    return np.concatenate([
        (rng.standard_normal(a * h) * np.sqrt(2.0 / a)).astype(np.float32), np.zeros(h, np.float32),
        (rng.standard_normal(h * c) * np.sqrt(2.0 / h)).astype(np.float32), np.zeros(c, np.float32)])


def unpack(w):
    a, h, c = SIZES
    i = a * h
    return w[:i].reshape(a, h), w[i:i + h], w[i + h:i + h + h * c].reshape(h, c), w[i + h + h * c:]


def to_f16(a):
    """Round to float16 and back: the precision a cheaper accelerator would use."""
    return a.astype(np.float16).astype(np.float32)


def grad(w, x, y, low_precision=False):
    """Mean cross-entropy gradient in float32. low_precision rounds weights and inputs to float16 first."""
    if low_precision:
        w, x = to_f16(w), to_f16(x)
    w1, b1, w2, b2 = unpack(w)
    z = x @ w1 + b1
    h = np.maximum(z, 0)
    o = h @ w2 + b2
    o = o - o.max(1, keepdims=True)
    p = np.exp(o)
    p /= p.sum(1, keepdims=True)
    p[np.arange(len(y)), y] -= 1
    p /= len(y)
    dh = (p @ w2.T) * (z > 0)
    return np.concatenate([(x.T @ dh).ravel(), dh.sum(0), (h.T @ p).ravel(), p.sum(0)]).astype(np.float32)


def loss(w, x, y):
    w1, b1, w2, b2 = unpack(w)
    o = np.maximum(x @ w1 + b1, 0) @ w2 + b2
    o = o - o.max(1, keepdims=True)
    lse = np.log(np.exp(o).sum(1))
    return float(np.mean(lse - o[np.arange(len(y)), y]))


def accuracy(w, x, y):
    w1, b1, w2, b2 = unpack(w)
    return float(np.mean((np.maximum(x @ w1 + b1, 0) @ w2 + b2).argmax(1) == y))


def lr_at(t, steps, lr0):
    return lr0 * 0.5 * (1 + np.cos(np.pi * t / steps))


STRATEGIES = ("skip", "half_batch", "float16")


def alternative(strategy, w, x, y, g_honest, lr):
    """The cheaper update a cheating worker would like to apply instead of the honest one."""
    if strategy == "skip":
        return np.zeros_like(w)
    if strategy == "half_batch":
        k = max(1, len(y) // 2)
        return -lr * grad(w, x[:k], y[:k])
    if strategy == "float16":
        return -lr * grad(w, x, y, low_precision=True)
    raise ValueError(strategy)


def train(data, seed, steps=1500, batch=64, lr0=0.2, strategy=None, tau=0.0, referee="reorder", record=False):
    """Train one worker. strategy None is honest. A cheating worker uses its alternative update on a step
    when the distance from the referee's honest recomputation of that step is at most tau.

    Returns (final weights, info) with the fraction of cheated steps and, if record, per-step
    update norms and honest-vs-referee drift."""
    xtr, ytr, _, _ = data
    rng = np.random.default_rng(seed)
    w = init(rng)
    order_rng = np.random.default_rng(10_000 + seed)
    perm_rng = np.random.default_rng(20_000 + seed)  # separate stream: cheating must not change the batches
    cheated = 0
    norms, drifts = [], []
    for t in range(steps):
        idx = order_rng.integers(0, len(ytr), batch)
        x, y = xtr[idx], ytr[idx]
        lr = lr_at(t, steps, lr0)
        d_honest = -lr * grad(w, x, y)
        step = d_honest
        if strategy is not None or record:
            perm = perm_rng.permutation(batch)
            if referee == "reorder":
                d_ref = -lr * grad(w, x[perm], y[perm])
            else:
                d_ref = -lr * grad(w, x, y, low_precision=True)
            if record:
                norms.append(float(np.linalg.norm(d_honest)))
                drifts.append(float(np.linalg.norm(d_honest - d_ref)))
            if strategy is not None:
                d_alt = alternative(strategy, w, x, y, d_honest, lr)
                if np.linalg.norm(d_alt - d_ref) <= tau:
                    step = d_alt
                    cheated += 1
        w = w + step
    return w, {"cheated": cheated / steps, "norms": norms, "drifts": drifts}


def bootstrap_ci(v, n=2000, seed=0, level=0.95):
    v = np.asarray(v, float)
    rng = np.random.default_rng(seed)
    m = rng.choice(v, (n, len(v))).mean(1)
    a = (1 - level) / 2
    return float(np.quantile(m, a)), float(np.quantile(m, 1 - a))
