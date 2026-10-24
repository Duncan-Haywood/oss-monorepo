"""A learned per-pixel blend weight for the stereo-depth view synthesis of capture-softgate.

For each pixel the two warped sources give a synthesised colour `base` and the raw nearest camera gives `near`.
The output is w*near + (1-w)*base. The best weight per pixel, given the truth, is the least-squares one:

    w* = clip( <base - truth, base - near> / |base - near|^2 , 0, 1 )

A regressor is fitted to predict w* from features the system can compute without the truth (warp disagreement,
matching cost, local texture, depth discontinuity, how many sources saw the pixel, the gap between the cameras).
Holes (pixels no source saw) always take the raw nearest camera, as in capture-softgate.
"""
import numpy as np
from .scene import W, H
from .hybrid import warped, plain, disagreement, match_cost, _dilate

FEATURES = ["disagree", "disagree_max3", "disagree_mean5", "cost", "cost_max3", "texture", "depth_edge",
            "depth_gap", "both_valid", "near_hole", "log_depth", "gap"]


def _filt(a, r, fn):
    p = np.pad(a, r, mode="edge")
    stack = [p[i:i + H, j:j + W] for i in range(2 * r + 1) for j in range(2 * r + 1)]
    return fn(stack)


def _grad(a):
    gy = np.zeros_like(a); gx = np.zeros_like(a)
    gy[1:-1] = np.abs(a[2:] - a[:-2]) / 2
    gx[:, 1:-1] = np.abs(a[:, 2:] - a[:, :-2]) / 2
    return gy + gx


def features(ws, have, gap_deg):
    """(H, W, len(FEATURES)) feature stack from the warped sources; no truth is used."""
    (c1, o1, z1, _), (c2, o2, z2, _) = ws[0], ws[1]
    d = disagreement(ws)
    k = match_cost(ws)
    base, _ = plain(ws)
    tex = _grad(base.mean(-1))
    z = np.where(o1, z1, np.where(o2, z2, 20.0))
    z = np.minimum(np.where(np.isfinite(z), z, 20.0), 20.0)
    both = o1 & o2
    zd = np.where(both, np.abs(np.where(np.isfinite(z1), z1, 20) - np.where(np.isfinite(z2), z2, 20)), 0.0)
    zd = np.minimum(zd, 5.0)
    f = [d, _filt(d, 1, lambda s: np.maximum.reduce(s)), _filt(d, 2, lambda s: sum(s) / len(s)),
         k, _filt(k, 1, lambda s: np.maximum.reduce(s)), tex, _grad(np.log(z)), zd,
         both.astype(float), _dilate(~o1, 1).astype(float), np.log(z), np.full((H, W), gap_deg / 30.0)]
    return np.stack(f, -1)


def ideal_weight(base, near, truth):
    """Least-squares blend weight per pixel (0 = synthesis, 1 = raw nearest), and the squared norm it is weighted by."""
    dv = base - near
    den = (dv ** 2).sum(-1)
    num = ((base - truth) * dv).sum(-1)
    with np.errstate(invalid="ignore", divide="ignore"):
        w = np.where(den > 1e-9, num / den, 0.0)
    return np.clip(w, 0.0, 1.0), den


class Scaler:
    def fit(self, X):
        self.mu, self.sd = X.mean(0), X.std(0) + 1e-6
        return self

    def __call__(self, X):
        return (X - self.mu) / self.sd


class Ridge:
    """Linear least squares with an L2 penalty, on standardised features."""
    def __init__(self, lam=1.0):
        self.lam = lam

    def fit(self, X, y, sw):
        self.sc = Scaler().fit(X)
        A = np.hstack([self.sc(X), np.ones((len(X), 1))])
        G = A.T @ (A * sw[:, None]) + self.lam * np.eye(A.shape[1])
        self.beta = np.linalg.solve(G, A.T @ (sw * y))
        return self

    def predict(self, X):
        return np.clip(np.hstack([self.sc(X), np.ones((len(X), 1))]) @ self.beta, 0, 1)


class MLP:
    """One hidden layer (tanh), sigmoid output, trained with Adam on the weighted squared error; numpy only."""
    def __init__(self, hidden=24, epochs=60, lr=3e-3, l2=1e-4, seed=0, batch=4096):
        self.h, self.epochs, self.lr, self.l2, self.seed, self.batch = hidden, epochs, lr, l2, seed, batch

    def _fwd(self, Z):
        a = np.tanh(Z @ self.W1 + self.b1)
        o = 1 / (1 + np.exp(-(a @ self.W2 + self.b2)))
        return a, o[:, 0]

    def fit(self, X, y, sw):
        rng = np.random.default_rng(self.seed)
        self.sc = Scaler().fit(X)
        Z = self.sc(X)
        n, m = Z.shape
        self.W1 = rng.standard_normal((m, self.h)) / np.sqrt(m); self.b1 = np.zeros(self.h)
        self.W2 = rng.standard_normal((self.h, 1)) / np.sqrt(self.h); self.b2 = np.zeros(1)
        params = [self.W1, self.b1, self.W2, self.b2]
        mom = [np.zeros_like(p) for p in params]; var = [np.zeros_like(p) for p in params]
        t = 0
        sw = sw / sw.mean()
        for _ in range(self.epochs):
            order = rng.permutation(n)
            for i in range(0, n, self.batch):
                idx = order[i:i + self.batch]
                a, o = self._fwd(Z[idx])
                go = (2 * sw[idx] * (o - y[idx]) * o * (1 - o) / len(idx))[:, None]
                ga = (go @ self.W2.T) * (1 - a ** 2)
                grads = [Z[idx].T @ ga + self.l2 * self.W1, ga.sum(0), a.T @ go + self.l2 * self.W2, go.sum(0)]
                t += 1
                for p, g, mo, va in zip(params, grads, mom, var):
                    mo *= 0.9; mo += 0.1 * g
                    va *= 0.999; va += 0.001 * g * g
                    p -= self.lr * (mo / (1 - 0.9 ** t)) / (np.sqrt(va / (1 - 0.999 ** t)) + 1e-8)
        return self

    def predict(self, X):
        return self._fwd(self.sc(X))[1]


def blend(model, ws, have, near, gap_deg):
    """Synthesised view using the model's per-pixel weight; holes take the raw nearest camera."""
    base, _ = plain(ws)
    w = model.predict(features(ws, have, gap_deg).reshape(-1, len(FEATURES))).reshape(H, W)
    w = np.where(have, w, 1.0)[..., None]
    return w * near + (1 - w) * base
