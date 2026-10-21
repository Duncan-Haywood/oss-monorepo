"""Ways to move the low-bit cliff of chip-digits' quantised MLP: MSE-optimal clipping, per-channel scales and
quantisation-aware training (straight-through estimator). Reuses chip_digits.model for data, float training and the
integer-exact lane specification; every per-tensor result below is integer-exact in that specification."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "chip-digits", "src"))
from chip_digits import model  # noqa: E402


def _q(w, s, wb):
    m = 2 ** (wb - 1) - 1
    return np.clip(np.round(w / s), -m - 1, m)


def clip_scale(w, wb):
    """Per-tensor scale minimising weight MSE over a grid of clip ratios (1.0 = max scaling)."""
    m = 2 ** (wb - 1) - 1
    best = None
    for r in np.linspace(0.2, 1.0, 81):
        s = r * np.abs(w).max() / m
        e = ((_q(w, s, wb) * s - w) ** 2).sum()
        if best is None or e < best[0]:
            best = (e, s)
    return best[1]


def quantise_scales(params, xtrain, wb, ab, scale_fn):
    """Same integer pipeline as model.quantise but with a chosen per-tensor weight scale."""
    w1, b1, w2, b2 = params
    amax = 2 ** ab - 1
    s1, s2 = scale_fn(w1, wb), scale_fn(w2, wb)
    q1, q2 = _q(w1, s1, wb).astype(np.int64), _q(w2, s2, wb).astype(np.int64)
    xs = 1.0 / amax
    xq = lambda x: np.clip(np.round(x / xs), 0, amax).astype(np.int64)
    qb1 = np.round(b1 / (s1 * xs)).astype(np.int64)
    hi = np.percentile(np.maximum(xq(xtrain) @ q1 + qb1, 0), 99.9)
    sh = max(0, int(np.ceil(np.log2(max(hi, 1) / amax))))
    qb2 = np.round(b2 / (s2 * s1 * xs * 2 ** sh)).astype(np.int64)
    return {"wb": wb, "ab": ab, "w1": q1, "b1": qb1, "w2": q2, "b2": qb2, "sh": sh, "xq": xq}


def max_scale(w, wb):
    return np.abs(w).max() / (2 ** (wb - 1) - 1)


def perchannel_acc(params, xtrain, x, y, wb, ab):
    """Per-output-channel max scales, float rescale of each accumulator (NOT an integer-exact lane: each
    channel needs its own multiplier or shift). Activations are A-bit with a 99.9th-percentile step."""
    w1, b1, w2, b2 = params
    m = 2 ** (wb - 1) - 1
    amax = 2 ** ab - 1
    fq = lambda w: _q(w, np.abs(w).max(0, keepdims=True) / m, wb) * (np.abs(w).max(0, keepdims=True) / m)
    xq = lambda a: np.clip(np.round(a * amax), 0, amax) / amax
    w1q, w2q = fq(w1), fq(w2)
    step = np.percentile(np.maximum(xq(xtrain) @ w1q + b1, 0), 99.9) / amax
    hq = lambda a: np.clip(np.round(np.maximum(a, 0) / step), 0, amax) * step
    z = hq(xq(x) @ w1q + b1) @ w2q + b2
    return float((z.argmax(1) == y).mean())


def qat_train(params, x, y, wb, ab, epochs=300, lr=0.2, l2=1e-4):
    """Fine-tune float params with W-bit weights and A-bit activations in the forward pass (STE backward)."""
    w1, b1, w2, b2 = [p.copy() for p in params]
    amax = 2 ** ab - 1
    t = np.eye(model.NOUT)[y]
    xq = np.clip(np.round(x * amax), 0, amax) / amax
    for _ in range(epochs):
        s1, s2 = max_scale(w1, wb), max_scale(w2, wb)
        w1q, w2q = _q(w1, s1, wb) * s1, _q(w2, s2, wb) * s2
        a1 = xq @ w1q + b1
        hi = np.percentile(np.maximum(a1, 0), 99.9) / (s1 / amax)
        sh = max(0, int(np.ceil(np.log2(max(hi, 1) / amax))))
        step = s1 / amax * 2 ** sh
        r = a1 / step
        hq = np.clip(np.round(np.maximum(r, 0)), 0, amax) * step
        z = hq @ w2q + b2
        p = np.exp(z - z.max(1, keepdims=True)); p /= p.sum(1, keepdims=True)
        g = (p - t) / len(x)
        gw2 = hq.T @ g + l2 * w2; gb2 = g.sum(0)
        gh = (g @ w2q.T) * ((r > 0) & (r < amax + 0.5))
        gw1 = xq.T @ gh + l2 * w1; gb1 = gh.sum(0)
        w1 -= lr * gw1; b1 -= lr * gb1; w2 -= lr * gw2; b2 -= lr * gb2
    return w1, b1, w2, b2
