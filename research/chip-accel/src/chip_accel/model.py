"""Tiny MLP (8-8-4) trained in float with NumPy, quantised to WB-bit integers, with an integer-exact reference.

The integer reference is what the RTL must match bit for bit. Toy synthetic task: 4 Gaussian clusters in 8-D.
"""
import numpy as np

NIN, NH, NOUT = 8, 8, 4


def make_data(seed=0, n=400):
    """Cluster centres are fixed (seed 0); `seed` only changes the sample draw."""
    centres = np.random.default_rng(0).normal(0, 1.5, (NOUT, NIN))
    rng = np.random.default_rng(seed + 1)
    y = rng.integers(0, NOUT, n)
    x = centres[y] + rng.normal(0, 1.0, (n, NIN))
    return x, y


def train_float(x, y, seed=0, epochs=400, lr=0.1):
    rng = np.random.default_rng(seed)
    w0 = rng.normal(0, 0.5, (NIN, NH)); b0 = np.zeros(NH)
    w1 = rng.normal(0, 0.5, (NH, NOUT)); b1 = np.zeros(NOUT)
    oh = np.eye(NOUT)[y]
    for _ in range(epochs):
        h = np.maximum(x @ w0 + b0, 0)
        z = h @ w1 + b1
        p = np.exp(z - z.max(1, keepdims=True)); p /= p.sum(1, keepdims=True)
        dz = (p - oh) / len(x)
        gw1 = h.T @ dz; gb1 = dz.sum(0)
        dh = (dz @ w1.T) * (h > 0)
        gw0 = x.T @ dh; gb0 = dh.sum(0)
        w0 -= lr * 10 * gw0; b0 -= lr * 10 * gb0; w1 -= lr * 10 * gw1; b1 -= lr * 10 * gb1
    return w0, b0, w1, b1


def quantise(params, x_train, wb):
    """Post-training symmetric quantisation to `wb`-bit signed ints; returns dict of integer tensors and shifts."""
    w0, b0, w1, b1 = params
    qmax = 2 ** (wb - 1) - 1
    sx = np.abs(x_train).max() / qmax
    sw0 = np.abs(w0).max() / qmax
    sw1 = np.abs(w1).max() / qmax
    aw = 2 * wb + 5                                  # accumulator width used by the RTL
    alim = 2 ** (aw - 1)
    clipb = lambda b: np.clip(b, -alim, alim - 1).astype(np.int64)
    xq = lambda x: np.clip(np.round(x / sx), -qmax - 1, qmax).astype(np.int64)
    W0 = np.clip(np.round(w0 / sw0), -qmax - 1, qmax).astype(np.int64)
    W1 = np.clip(np.round(w1 / sw1), -qmax - 1, qmax).astype(np.int64)
    B0 = clipb(np.round(b0 / (sx * sw0)))
    acc0 = xq(x_train) @ W0 + B0
    s0 = max(0, int(np.ceil(np.log2(max(acc0.max(), 1) / qmax))))
    sh = sx * sw0 * 2 ** s0
    B1 = clipb(np.round(b1 / (sh * sw1)))
    h = np.clip(np.maximum(acc0, 0) >> s0, 0, qmax)
    acc1 = h @ W1 + B1
    s1 = max(0, int(np.ceil(np.log2(max(np.abs(acc1).max(), 1) / qmax))))
    return dict(wb=wb, aw=aw, W0=W0, B0=B0, W1=W1, B1=B1, s0=s0, s1=s1, xq=xq)


def int_forward(q, xi):
    """Integer-exact forward pass, the spec for the RTL. xi: (n, 8) ints. Returns (n, 4) ints."""
    qmax = 2 ** (q["wb"] - 1) - 1
    h = np.clip(np.maximum(xi @ q["W0"] + q["B0"], 0) >> q["s0"], 0, qmax)
    return np.clip((h @ q["W1"] + q["B1"]) >> q["s1"], -qmax - 1, qmax)


def predict(y):
    return np.argmax(y, axis=1)   # first index wins ties
