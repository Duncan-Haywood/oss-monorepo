"""Heavy-tailed generators for the webcam-signal imitation game.

Builds on ../mimic-webcam (data windows, feature groups, reference detector).
Three generators that take the marginals from the training people instead of
a Gaussian:

  copula    Gaussian copula: AR(1) latent per channel, correlated across
            channels, mapped through each channel's pooled empirical quantile
            function (so levels, floors and tails match by construction).
  copula+h  copula plus holds (repeat previous frame with the training rate).
  regime    two-state per channel: a "quiet" state at the channel's floor and a
            "burst" state drawing a value from the training burst pool, with
            Markov switching fitted from training windows.
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-webcam"))
import data as D  # noqa: E402
import signals as S  # noqa: E402

NCH = S.NCH
NQ = 512


class TailFit:
    def __init__(self, W):
        self.base = S.Fit(W)
        self.W = W
        flat = W.reshape(-1, NCH)
        qs = np.linspace(0, 1, NQ)
        self.quant = np.stack([np.quantile(flat[:, c], qs) for c in range(NCH)], 1)   # (NQ, 12)
        # normal scores of the training data, to fit latent AR(1) and correlation
        z = np.empty_like(W)
        for c in range(NCH):
            r = np.argsort(np.argsort(W[:, :, c].ravel() + 1e-9 * np.random.default_rng(0).standard_normal(W[:, :, c].size)))
            u = (r + 0.5) / r.size
            z[:, :, c] = _ndtri(u).reshape(W.shape[:2])
        dev = z
        den = (dev ** 2).sum((0, 1))
        self.rho = np.clip((dev[:, 1:] * dev[:, :-1]).sum((0, 1)) / np.maximum(den, 1e-9), 0, 0.995)
        c = np.corrcoef(dev.reshape(-1, NCH).T)
        self.chol = np.linalg.cholesky(np.nan_to_num(c) + 1e-6 * np.eye(NCH))
        # regime fit: quiet = value <= channel's 60th percentile
        thr = np.quantile(flat, 0.6, axis=0)
        self.thr = thr
        burst = W > thr
        self.pools_q = [flat[flat[:, c] <= thr[c], c] for c in range(NCH)]
        self.pools_b = [flat[flat[:, c] > thr[c], c] if (flat[:, c] > thr[c]).any() else flat[:, c] for c in range(NCH)]
        a = burst[:, :-1]
        b = burst[:, 1:]
        self.p_stay_q = np.array([((~a[:, :, c]) & (~b[:, :, c])).sum() / max((~a[:, :, c]).sum(), 1) for c in range(NCH)])
        self.p_stay_b = np.array([(a[:, :, c] & b[:, :, c]).sum() / max(a[:, :, c].sum(), 1) for c in range(NCH)])
        self.hold = self.base.hold


def _ndtri(u):
    from scipy.special import ndtri
    return ndtri(np.clip(u, 1e-6, 1 - 1e-6))


def _ndtr(z):
    from scipy.special import ndtr
    return ndtr(z)


def gen_copula(fit, n, rng, T=100, hold=0.0):
    out = np.empty((n, T, NCH))
    s = np.sqrt(1 - fit.rho ** 2)
    for i in range(n):
        e = rng.standard_normal((T, NCH)) @ fit.chol.T
        x = np.empty((T, NCH))
        x[0] = e[0]
        for t in range(1, T):
            x[t] = fit.rho * x[t - 1] + s * e[t]
        u = _ndtr(x)
        idx = np.clip((u * (NQ - 1)).round().astype(int), 0, NQ - 1)
        y = fit.quant[idx, np.arange(NCH)]
        if hold > 0:
            h = rng.random(T) < hold
            for t in range(1, T):
                if h[t]:
                    y[t] = y[t - 1]
        out[i] = y
    return out


def gen_regime(fit, n, rng, T=100, hold=0.0):
    out = np.empty((n, T, NCH))
    for i in range(n):
        state = rng.random(NCH) > 0.6
        y = np.empty((T, NCH))
        for t in range(T):
            if t:
                stay = np.where(state, fit.p_stay_b, fit.p_stay_q)
                state = np.where(rng.random(NCH) < stay, state, ~state)
            for c in range(NCH):
                p = fit.pools_b[c] if state[c] else fit.pools_q[c]
                y[t, c] = p[rng.integers(len(p))]
        if hold > 0:
            h = rng.random(T) < hold
            for t in range(1, T):
                if h[t]:
                    y[t] = y[t - 1]
        out[i] = y
    return out


def gen_copula_win(fit, n, rng, T=100, hold=0.0):
    """Copula shape, then each channel's mean and spread set to a random training window's."""
    y = gen_copula(fit, n, rng, T, hold)
    b = fit.base
    for i in range(n):
        k = rng.integers(len(b.win_mu))
        m, sd = y[i].mean(0), y[i].std(0)
        scale = np.where(sd > 1e-9, b.win_sd[k] / np.maximum(sd, 1e-9), 0.0)
        y[i] = np.clip(b.win_mu[k] + (y[i] - m) * scale, S.LO, S.HI)
    return y


def gen_copula_rank(fit, n, rng, T=100, hold=0.0, W=None):
    """Copula dynamics, then each channel's values replaced by a random training window's
    sorted values in the same rank order, so the window's level, spread, max and min match
    exactly (per-window max/min match, the next step of mimic-webcam-tails G5)."""
    y = gen_copula(fit, n, rng, T)
    W = fit.W
    for i in range(n):
        w = W[rng.integers(len(W))]
        r = np.argsort(np.argsort(y[i] + 1e-9 * rng.standard_normal(y[i].shape), axis=0), axis=0)
        y[i] = np.take_along_axis(np.sort(w, axis=0), r, axis=0)
        if hold > 0:
            h = rng.random(T) < hold
            for t in range(1, T):
                if h[t]:
                    y[i, t] = y[i, t - 1]
    return y


GENERATORS = {
    "G0 L5 (Gaussian, from mimic-webcam)": None,
    "G1 copula (empirical marginals)": lambda f, n, r: gen_copula(f, n, r),
    "G2 copula + holds": lambda f, n, r: gen_copula(f, n, r, hold=f.hold),
    "G3 regime (quiet/burst pools)": lambda f, n, r: gen_regime(f, n, r),
    "G4 regime + holds": lambda f, n, r: gen_regime(f, n, r, hold=f.hold),
    "G5 copula + window level/spread + holds": lambda f, n, r: gen_copula_win(f, n, r, hold=f.hold),
    "G6 copula ranks through a real window's values + holds": lambda f, n, r: gen_copula_rank(f, n, r, hold=f.hold),
}
