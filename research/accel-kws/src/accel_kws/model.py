"""Quantised one-hidden-layer MLP for keyword spotting, trained in NumPy, plus its integer reference.

Integer semantics (the contract the RTL must meet bit for bit):
    x_q  : int8 inputs, x_q = clip(round(32 * standardised feature), -128, 127)
    acc1 = sum_i x_q[i] * w1_q[j, i] + b1_q[j]          (signed, ACCW bits)
    h[j] = clip(acc1 >> S1, 0, 255)                      (arithmetic shift, ReLU, 8-bit unsigned)
    acc2 = sum_j h[j] * w2_q[k, j] + b2_q[k]
    class = first index of the maximum acc2
Weights are signed integers of WB bits (range -(2^(WB-1)-1) .. 2^(WB-1)-1), scales are powers of two.
"""
from dataclasses import dataclass

import numpy as np

XSCALE = 32.0
ACCW = 24
OUT = 11


def clip_acc(v):
    lim = 1 << (ACCW - 1)
    return np.clip(v, -lim, lim - 1)


def qmax(bits):
    return (1 << (bits - 1)) - 1


def pow2_scale(w, bits, k=2.5):
    """Power-of-two weight step so that about k standard deviations fit in the range."""
    q = qmax(bits)
    step = max(k * float(np.std(w)), 1e-8) / q
    return 2.0 ** np.round(np.log2(step))


def quant_w(w, bits):
    s = pow2_scale(w, bits)
    return np.clip(np.round(w / s), -qmax(bits), qmax(bits)), s


@dataclass
class IntModel:
    w1: np.ndarray  # (H, IN) int
    b1: np.ndarray  # (H,)
    w2: np.ndarray  # (OUT, H)
    b2: np.ndarray  # (OUT,)
    s1: int
    wbits: int
    mean: np.ndarray
    std: np.ndarray

    @property
    def inputs(self):
        return self.w1.shape[1]

    @property
    def hidden(self):
        return self.w1.shape[0]


def quantise_inputs(x, mean, std):
    return np.clip(np.round(XSCALE * (x - mean) / std), -128, 127).astype(np.int64)


def int_forward(m, xq, check=True):
    """Integer reference. xq: (N, IN) int. Returns (logits (N, OUT) int64, hidden (N, H))."""
    a1 = xq @ m.w1.T.astype(np.int64) + m.b1
    if check:
        assert np.abs(a1).max() < (1 << (ACCW - 1)), "layer-1 accumulator overflow"
    h = np.clip(a1 >> m.s1, 0, 255)
    a2 = h @ m.w2.T.astype(np.int64) + m.b2
    if check:
        assert np.abs(a2).max() < (1 << (ACCW - 1)), "layer-2 accumulator overflow"
    return a2, h


def int_predict(m, xq):
    return np.argmax(int_forward(m, xq)[0], axis=1)


def macs(inputs, hidden):
    return inputs * hidden + hidden * OUT


def train_qat(xtr, ytr, hidden, wbits, epochs=30, seed=0, lr=3e-3, batch=256, wd=1e-4, xval=None, yval=None):
    """Quantisation-aware training with straight-through gradients. Returns an IntModel.

    The float shadow weights are fake-quantised in the forward pass; the hidden activation is
    fake-quantised to 8 bits with a power-of-two step re-calibrated each epoch until 70% of training.
    The reported accuracy always comes from the integer reference, not from this forward pass.
    """
    rng = np.random.default_rng(seed)
    mean = xtr.mean(axis=0)
    std = xtr.std(axis=0) + 1e-6
    xq = quantise_inputs(xtr, mean, std).astype(np.float64)
    xin = xq / XSCALE
    n, d = xin.shape
    w1 = rng.normal(0, np.sqrt(2.0 / d), (d, hidden))
    b1 = np.zeros(hidden)
    w2 = rng.normal(0, np.sqrt(2.0 / hidden), (hidden, OUT))
    b2 = np.zeros(OUT)
    params = [w1, b1, w2, b2]
    mom = [np.zeros_like(p) for p in params]
    vel = [np.zeros_like(p) for p in params]
    t = 0
    s1 = 0
    kx = -np.log2(XSCALE)  # x_q * 2^kx recovers the standardised value
    steps = epochs * int(np.ceil(n / batch))
    freeze_at = int(0.7 * epochs)
    for ep in range(epochs):
        # calibrate the activation step from the current float network
        q1, s_w1 = quant_w(w1, wbits)
        a1 = xin @ (q1 * s_w1) + b1
        if ep <= freeze_at:
            hi = np.percentile(np.maximum(a1, 0), 99.5) + 1e-9
            kh = int(np.ceil(np.log2(hi / 255.0)))
            kw1 = int(np.log2(s_w1))
            s1 = max(kh - (int(kx) + kw1), 0)
            sh = 2.0 ** (int(kx) + kw1 + s1)
        perm = rng.permutation(n)
        for i in range(0, n, batch):
            idx = perm[i:i + batch]
            xb, yb = xin[idx], ytr[idx]
            q1, sw1 = quant_w(w1, wbits)
            q2, sw2 = quant_w(w2, wbits)
            w1q, w2q = q1 * sw1, q2 * sw2
            a1 = xb @ w1q + b1
            hq = np.clip(np.floor(a1 / sh), 0, 255)
            h = hq * sh
            z = h @ w2q + b2
            z -= z.max(axis=1, keepdims=True)
            p = np.exp(z)
            p /= p.sum(axis=1, keepdims=True)
            g = p
            g[np.arange(len(yb)), yb] -= 1.0
            g /= len(yb)
            gw2 = h.T @ g
            gb2 = g.sum(axis=0)
            gh = g @ w2q.T
            inrange = (a1 / sh >= 0) & (a1 / sh < 256)
            ga = gh * inrange
            gw1 = xb.T @ ga
            gb1 = ga.sum(axis=0)
            grads = [gw1 + wd * w1, gb1, gw2 + wd * w2, gb2]
            t += 1
            cur = lr * 0.5 * (1 + np.cos(np.pi * t / steps))
            for k, (pp, gg) in enumerate(zip(params, grads)):
                mom[k] = 0.9 * mom[k] + 0.1 * gg
                vel[k] = 0.999 * vel[k] + 0.001 * gg * gg
                mh = mom[k] / (1 - 0.9 ** t)
                vh = vel[k] / (1 - 0.999 ** t)
                pp -= cur * mh / (np.sqrt(vh) + 1e-8)
    return export(w1, b1, w2, b2, wbits, mean, std, xin, s1)


def export(w1, b1, w2, b2, wbits, mean, std, xin, s1_hint):
    q1, sw1 = quant_w(w1, wbits)
    q2, sw2 = quant_w(w2, wbits)
    kx = -int(np.log2(XSCALE))
    kw1 = int(np.log2(sw1))
    kw2 = int(np.log2(sw2))
    a1 = xin @ (q1 * sw1) + b1
    hi = np.percentile(np.maximum(a1, 0), 99.5) + 1e-9
    kh = int(np.ceil(np.log2(hi / 255.0)))
    s1 = max(kh - (kx + kw1), 0)
    sh = 2.0 ** (kx + kw1 + s1)
    lim = 1 << (ACCW - 2)
    b1q = np.clip(np.round(b1 / 2.0 ** (kx + kw1)), -lim, lim).astype(np.int64)
    b2q = np.clip(np.round(b2 / (sh * 2.0 ** kw2)), -lim, lim).astype(np.int64)
    return IntModel(q1.T.astype(np.int64), b1q, q2.T.astype(np.int64), b2q, int(s1), wbits, mean, std)
