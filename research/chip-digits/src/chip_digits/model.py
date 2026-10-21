"""64-16-10 ReLU MLP on the scikit-learn digits data (real 8x8 images, 1797 samples), trained in float,
then post-training quantised with an integer-exact forward pass that the RTL lane must reproduce."""
import numpy as np
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split

NIN, NHID, NOUT = 64, 16, 10


def load(seed):
    d = load_digits()
    return train_test_split(d.data / 16.0, d.target, test_size=0.3, random_state=seed, stratify=d.target)


def train_float(x, y, seed, epochs=400, lr=0.5, l2=1e-4):
    r = np.random.RandomState(seed)
    w1 = r.randn(NIN, NHID) * np.sqrt(2 / NIN); b1 = np.zeros(NHID)
    w2 = r.randn(NHID, NOUT) * np.sqrt(2 / NHID); b2 = np.zeros(NOUT)
    t = np.eye(NOUT)[y]
    for _ in range(epochs):
        h = np.maximum(x @ w1 + b1, 0); z = h @ w2 + b2
        p = np.exp(z - z.max(1, keepdims=True)); p /= p.sum(1, keepdims=True)
        g = (p - t) / len(x)
        gw2 = h.T @ g + l2 * w2; gb2 = g.sum(0)
        gh = (g @ w2.T) * (h > 0)
        gw1 = x.T @ gh + l2 * w1; gb1 = gh.sum(0)
        w1 -= lr * gw1; b1 -= lr * gb1; w2 -= lr * gw2; b2 -= lr * gb2
    return w1, b1, w2, b2


def float_acc(params, x, y):
    w1, b1, w2, b2 = params
    return float((np.argmax(np.maximum(x @ w1 + b1, 0) @ w2 + b2, 1) == y).mean())


def _wq(w, wb):
    """Symmetric per-tensor weight quantisation to signed wb-bit integers; returns ints and the scale."""
    m = 2 ** (wb - 1) - 1
    s = np.abs(w).max() / m
    return np.clip(np.round(w / s), -m - 1, m).astype(np.int64), s


def quantise(params, xtrain, wb, ab):
    """Inputs and hidden activations are unsigned ab-bit; weights signed wb-bit. Biases are int accumulator
    values; the hidden layer is rescaled by a power-of-two right shift chosen on the training set."""
    w1, b1, w2, b2 = params
    amax = 2 ** ab - 1
    q1, s1 = _wq(w1, wb); q2, s2 = _wq(w2, wb)
    xs = 1.0 / amax                                    # input step: [0,1] -> 0..amax
    xq = lambda x: np.clip(np.round(x / xs), 0, amax).astype(np.int64)
    qb1 = np.round(b1 / (s1 * xs)).astype(np.int64)
    acc1 = xq(xtrain) @ q1 + qb1
    hi = np.percentile(np.maximum(acc1, 0), 99.9)
    sh = max(0, int(np.ceil(np.log2(max(hi, 1) / amax))))
    hs = s1 * xs * 2 ** sh                             # hidden activation step
    qb2 = np.round(b2 / (s2 * hs)).astype(np.int64)
    return {"wb": wb, "ab": ab, "w1": q1, "b1": qb1, "w2": q2, "b2": qb2, "sh": sh, "xq": xq}


def int_forward(q, xi):
    amax = 2 ** q["ab"] - 1
    h = np.clip(np.maximum(xi @ q["w1"] + q["b1"], 0) >> q["sh"], 0, amax)
    return h @ q["w2"] + q["b2"], h


def int_acc(q, x, y):
    return float((np.argmax(int_forward(q, q["xq"](x))[0], 1) == y).mean())
