"""Webcam-signal generators (the imitator's code), feature functions (the
detector's code) and the human reference split.

A sample is a 10 s window at 10 Hz of the 12 Affectiva channels, shape (100, 12).
"""
import numpy as np

import data as D

NCH = len(D.CHANNELS)
LO = np.array([0.0] * (NCH - 1) + [-100.0])
HI = np.full(NCH, 100.0)
J, V, ENG, NEU = (D.CHANNELS.index(c) for c in ("Joy", "Valence", "Engagement", "Neutral"))

# --- detector side: feature functions, in named groups ----------------------

GROUPS = ("level", "spread", "extremes", "roughness", "autocorr", "holds", "floor", "cross")


def _acf1(W):
    d = W - W.mean(1, keepdims=True)
    den = (d * d).sum(1)
    return np.where(den > 1e-12, (d[:, 1:] * d[:, :-1]).sum(1) / np.maximum(den, 1e-12), 0.0)


def feature_groups(W):
    """W: (n, 100, 12) -> {group: (n, k) array}."""
    dW = np.diff(W, axis=1)
    held = (np.abs(dW).max(2) < 1e-9)                       # no channel moved
    ch_held = (np.abs(dW) < 1e-9)
    run = np.zeros(len(W))
    for i, h in enumerate(held):
        r = best = 0
        for x in h:
            r = r + 1 if x else 0
            best = max(best, r)
        run[i] = best
    cj = np.array([np.corrcoef(w[:, a], w[:, b])[0, 1] if w[:, a].std() > 1e-9 and w[:, b].std() > 1e-9 else 0.0
                   for w in W for a, b in ((J, V), (ENG, NEU))]).reshape(len(W), 2)
    return {
        "level": W.mean(1),
        "spread": W.std(1),
        "extremes": np.hstack([W.max(1), W.min(1)]),
        "roughness": np.abs(dW).mean(1),
        "autocorr": np.stack([_acf1(W[:, :, c]) for c in range(NCH)], 1),
        "holds": np.column_stack([held.mean(1), run, ch_held.mean(1)]),
        "floor": np.hstack([(W < 0.5).mean(1)[:, :NCH - 1], (W[:, :, NEU] > 99).mean(1, keepdims=True)]),
        "cross": cj,
    }


def stack(fg, groups=GROUPS):
    return np.hstack([fg[g] for g in groups])


# --- imitator side: generator program ---------------------------------------

class Fit:
    """What the imitator may learn from the training people's windows."""

    def __init__(self, W):
        self.mu = W.mean((0, 1))
        self.sd = W.std((0, 1))
        self.win_mu = W.mean(1)                     # (n, 12) pool of window levels
        self.win_sd = W.std(1)
        dev = W - W.mean(1, keepdims=True)
        den = (dev ** 2).sum((0, 1))
        self.rho = np.clip((dev[:, 1:] * dev[:, :-1]).sum((0, 1)) / np.maximum(den, 1e-9), 0, 0.99)
        flat = dev.reshape(-1, NCH)
        c = np.corrcoef(flat.T)
        self.chol = np.linalg.cholesky(np.nan_to_num(c) + 1e-6 * np.eye(NCH))
        self.hold = float((np.abs(np.diff(W, axis=1)).max(2) < 1e-9).mean())
        self.spike_sd = self.sd * 3


GENES = {
    "level": ("global", "window"),
    "amp_src": ("global", "window"),
    "dyn": ("iid", "ar1"),
    "amp": (0.25, 0.5, 0.75, 1.0, 1.25, 1.5),
    "rho_mult": (0.6, 0.8, 1.0, 1.1),
    "cross": (False, True),
    "hold": (0.0, 0.25, 0.5, 0.65, 0.8),
    "spike": (0.0, 0.01, 0.03, 0.08),
    "decimals": (None, 2),
}
NAIVE = {"level": "global", "amp_src": "global", "dyn": "iid", "amp": 1.0, "rho_mult": 1.0,
         "cross": False, "hold": 0.0, "spike": 0.0, "decimals": None}


def mutate(genome, gene, rng):
    g = dict(genome)
    opts = [o for o in GENES[gene] if o != g[gene]]
    g[gene] = opts[rng.integers(len(opts))]
    return g


def generate(genome, fit, n, rng, T=100):
    out = np.empty((n, T, NCH))
    for i in range(n):
        k = rng.integers(len(fit.win_mu))
        mu = fit.win_mu[k] if genome["level"] == "window" else fit.mu
        sd = (fit.win_sd[k] if genome["amp_src"] == "window" else fit.sd) * genome["amp"]
        rho = np.clip(fit.rho * genome["rho_mult"], 0, 0.99) if genome["dyn"] == "ar1" else np.zeros(NCH)
        e = rng.standard_normal((T, NCH))
        if genome["cross"]:
            e = e @ fit.chol.T
        x = np.empty((T, NCH))
        x[0] = e[0] * sd
        for t in range(1, T):
            x[t] = rho * x[t - 1] + np.sqrt(1 - rho ** 2) * sd * e[t]
        if genome["spike"] > 0:
            m = rng.random((T, NCH)) < genome["spike"]
            x += m * rng.exponential(fit.spike_sd, (T, NCH))
        y = mu + x
        if genome["hold"] > 0:
            h = rng.random(T) < genome["hold"]
            for t in range(1, T):
                if h[t]:
                    y[t] = y[t - 1]
        y = np.clip(y, LO, HI)
        if genome["decimals"] is not None:
            y = np.round(y, genome["decimals"])
        out[i] = y
    return out


def replay(W, n, rng):
    """Ceiling: whole windows of other people (copies people)."""
    return W[rng.integers(len(W), size=n)].copy()


def stitch(W, n, rng, seg=25):
    """Ceiling: 2.5 s segments from random windows (copies people)."""
    out = np.empty((n, W.shape[1], NCH))
    for i in range(n):
        for s in range(0, W.shape[1], seg):
            out[i, s:s + seg] = W[rng.integers(len(W)), s:s + seg]
    return out


def split(person, seed, n_train=24, n_loop=8):
    """Split people (not windows) into imitator/train, loop-validation and reference-test."""
    ids = np.array(sorted(set(person)))
    rng = np.random.default_rng(1000 + seed)
    rng.shuffle(ids)
    return ids[:n_train], ids[n_train:n_train + n_loop], ids[n_train + n_loop:]
