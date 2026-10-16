"""Kernel two-sample test (MMD) against a classifier two-sample test (C2ST) for pendulum digital twins.

Self-contained: the stylised pendulum 'real system' and twins follow research/free-c2stpower (copied so this
directory stands alone). Everything is simulated; no real data.
"""
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict

G_OVER_L, DT, STEPS = 9.81, 0.02, 100
REAL = dict(visc=0.1, coul=0.3, sd=0.02, kind="student3")


def simulate(theta0, visc, coul, steps=STEPS, dt=DT):
    """Noise-free RK4 trajectory released at rest, shape (n, steps); Coulomb term is coul*tanh(w/0.05)."""
    def f(th, w):
        return w, -G_OVER_L * np.sin(th) - visc * w - coul * np.tanh(w / 0.05)
    th, w = theta0.astype(float).copy(), np.zeros(len(theta0))
    out = np.empty((len(th), steps))
    for t in range(steps):
        out[:, t] = th
        k1 = f(th, w)
        k2 = f(th + dt / 2 * k1[0], w + dt / 2 * k1[1])
        k3 = f(th + dt / 2 * k2[0], w + dt / 2 * k2[1])
        k4 = f(th + dt * k3[0], w + dt * k3[1])
        th = th + dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
        w = w + dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
    return out


def noise(rng, shape, sd, kind):
    """Zero-mean noise with standard deviation sd ('gauss' or 'student3', df 3 rescaled to the same sd)."""
    if kind == "gauss":
        return rng.normal(0, sd, shape)
    if kind == "student3":
        return rng.standard_t(3, shape) * sd / np.sqrt(3.0)
    raise ValueError(kind)


def sample(rng, n, visc, coul, sd, kind):
    """n noisy trajectories with independent uniform start angles in [-2, 2]."""
    clean = simulate(rng.uniform(-2.0, 2.0, n), visc, coul)
    return clean + noise(rng, clean.shape, sd, kind)


def features(x, kind):
    """'raw' trajectory, or 'resid': second differences (cancel smooth motion, keep noise)."""
    if kind == "raw":
        return x
    if kind == "resid":
        return x[:, 2:] - 2 * x[:, 1:-1] + x[:, :-2]
    raise ValueError(kind)


def _sqdist(a, b):
    return np.maximum((a * a).sum(1)[:, None] + (b * b).sum(1)[None, :] - 2 * a @ b.T, 0.0)


def mmd2(x, y, bandwidth=None):
    """Unbiased squared MMD with an RBF kernel. Bandwidth defaults to the median pooled distance (median heuristic)."""
    z = np.vstack([x, y])
    if bandwidth is None:
        d = _sqdist(z, z)
        bandwidth = float(np.sqrt(np.median(d[np.triu_indices(len(z), 1)])))
    g = 1.0 / (2 * bandwidth ** 2)
    kxx, kyy, kxy = (np.exp(-g * _sqdist(a, b)) for a, b in ((x, x), (y, y), (x, y)))
    n, m = len(x), len(y)
    return float((kxx.sum() - np.trace(kxx)) / (n * (n - 1)) + (kyy.sum() - np.trace(kyy)) / (m * (m - 1))
                 - 2 * kxy.mean())


def c2st_auc(real, twin, feat, seed=0, folds=5):
    """5-fold cross-validated AUROC of gradient-boosted trees separating real (1) from twin (0) rows."""
    X = features(np.vstack([real, twin]), feat)
    y = np.r_[np.ones(len(real)), np.zeros(len(twin))].astype(int)
    clf = HistGradientBoostingClassifier(max_iter=100, learning_rate=0.1, random_state=seed)
    cv = StratifiedKFold(folds, shuffle=True, random_state=seed)
    return roc_auc_score(y, cross_val_predict(clf, X, y, cv=cv, method="predict_proba")[:, 1])


def threshold(null_values, alpha=0.05):
    """Rejection threshold: the (1-alpha) empirical quantile of the statistic under the exact twin."""
    return float(np.quantile(np.asarray(null_values), 1 - alpha))


def power(stat_values, thr):
    """Fraction of replicates above the threshold, with a Wilson 95% interval."""
    k, n = int(np.sum(np.asarray(stat_values) > thr)), len(stat_values)
    z, p = 1.96, k / n
    c = (p + z * z / (2 * n)) / (1 + z * z / n)
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return p, max(0.0, c - h), min(1.0, c + h)
