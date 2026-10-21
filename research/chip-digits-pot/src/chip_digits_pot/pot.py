"""Per-channel power-of-two weight scales for the chip-digits MLP. Each output channel j has scale 2**e_j, so the
float rescale that made `chip-digits-qat`'s per-channel variant non-integer becomes a shift of the accumulator.
The forward pass below is pure integer (shifts, adds, multiplies); `float_check` recomputes it in float64, where
powers of two are exact, to test that."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "chip-digits", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "chip-digits-qat", "src"))
from chip_digits import model  # noqa: E402


def exponents(w, wb, how, span=3):
    """Per-column exponent e_j (scale 2**e_j). 'max': smallest scale that does not clip the column maximum.
    'mse': the exponent in [max-span, max] minimising the column's squared weight error (clipping allowed)."""
    m = 2 ** (wb - 1) - 1
    top = np.ceil(np.log2(np.maximum(np.abs(w).max(0), 1e-12) / m)).astype(int)
    if how == "max":
        return top
    out = top.copy()
    for j in range(w.shape[1]):
        best = None
        for e in range(top[j] - span, top[j] + 1):
            s = 2.0 ** e
            err = ((np.clip(np.round(w[:, j] / s), -m - 1, m) * s - w[:, j]) ** 2).sum()
            if best is None or err < best[0]:
                best = (err, e)
        out[j] = best[1]
    return out


def _q(w, e, wb):
    m = 2 ** (wb - 1) - 1
    return np.clip(np.round(w / 2.0 ** e), -m - 1, m).astype(np.int64)


def quantise(params, xtrain, wb, ab, how="max", force_single=False):
    """Integer lane with a shift per channel. force_single=True gives every channel the same exponent (the
    largest), which must reproduce a per-tensor power-of-two lane."""
    w1, b1, w2, b2 = params
    amax = 2 ** ab - 1
    e1, e2 = exponents(w1, wb, how), exponents(w2, wb, how)
    if force_single:
        e1[:] = e1.max(); e2[:] = e2.max()
    q1, q2 = _q(w1, e1, wb), _q(w2, e2, wb)
    xs = 1.0 / amax
    xq = lambda x: np.clip(np.round(x / xs), 0, amax).astype(np.int64)
    qb1 = np.round(b1 / (2.0 ** e1 * xs)).astype(np.int64)
    d1 = e1 - e1.min()                                   # left shift to the finest channel's unit
    u = (xq(xtrain) @ q1 + qb1) << d1
    hi = np.percentile(np.maximum(u, 0), 99.9)
    p = max(0, int(np.ceil(np.log2(max(hi, 1) / amax))))  # common right shift
    hs = xs * 2.0 ** (e1.min() + p)                      # hidden step as a value
    qb2 = np.round(b2 / (2.0 ** e2 * hs)).astype(np.int64)
    return {"wb": wb, "ab": ab, "w1": q1, "b1": qb1, "w2": q2, "b2": qb2, "d1": d1, "p": p, "e1": e1,
            "e2": e2, "d2": e2 - e2.min(), "hs": hs, "xq": xq}


def int_forward(q, xi):
    amax = 2 ** q["ab"] - 1
    h = np.clip(np.maximum((xi @ q["w1"] + q["b1"]) << q["d1"], 0) >> q["p"], 0, amax)
    return (h @ q["w2"] + q["b2"]) << q["d2"], h


def int_acc(q, x, y):
    return float((np.argmax(int_forward(q, q["xq"](x))[0], 1) == y).mean())


def float_check(q, xi):
    """Same computation in float64 with explicit scales; returns the logits in units of the finest layer-2 scale."""
    amax = 2 ** q["ab"] - 1
    a1 = (xi @ q["w1"] + q["b1"]) * 2.0 ** (q["e1"] - q["e1"].min())
    h = np.clip(np.floor(np.maximum(a1, 0) / 2.0 ** q["p"]), 0, amax)
    return (h @ q["w2"] + q["b2"]) * 2.0 ** q["d2"]


def shift_cost(q):
    """Shift amounts the lane needs. Layer 1: net per-channel shift p - d1_j (negative = left); layer 2: left
    shift d2_c. Barrel-shifter mux2 stages = ceil(log2(number of distinct shift amounts)) per channel."""
    s1 = q["p"] - q["d1"]
    n1 = int(s1.max() - s1.min() + 1)
    n2 = int(q["d2"].max() + 1)
    st = lambda n: int(np.ceil(np.log2(n))) if n > 1 else 0
    return {"l1_range": n1, "l2_range": n2, "stages1": st(n1), "stages2": st(n2)}
