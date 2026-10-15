"""Pendulum 'real system' and its digital twins, plus classifier two-sample tests (C2ST).

The real system has Coulomb + viscous friction and heavy-tailed (Student-t) sensor noise. A twin is the same
simulator with some parameter or noise assumption changed. Everything is stylised and simulated: no real data.
"""
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

G_OVER_L, DT, STEPS = 9.81, 0.02, 100


def simulate(theta0, visc, coul, steps=STEPS, dt=DT):
    """Noise-free RK4 trajectory of a pendulum, shape (n, steps). Coulomb friction uses tanh(w/0.05)."""
    def f(th, w):
        return w, -G_OVER_L * np.sin(th) - visc * w - coul * np.tanh(w / 0.05)
    th, w = theta0.astype(float).copy(), np.zeros_like(theta0, dtype=float)
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
    """Zero-mean noise with standard deviation sd. 'gauss' or 'student3' (df=3, rescaled to the same sd)."""
    if kind == "gauss":
        return rng.normal(0, sd, shape)
    if kind == "student3":
        return rng.standard_t(3, shape) * sd / np.sqrt(3.0)  # Var(t3) = 3
    raise ValueError(kind)


def dataset(rng, n, visc, coul, sd, kind):
    th0 = rng.uniform(-2.0, 2.0, n)
    clean = simulate(th0, visc, coul)
    return th0, clean, clean + noise(rng, clean.shape, sd, kind)


def features(x, kind):
    """'raw': the trajectory itself. 'raw+resid': raw plus second differences (which cancel smooth motion)."""
    if kind == "raw":
        return x
    d2 = x[:, 2:] - 2 * x[:, 1:-1] + x[:, :-2]
    return np.hstack([x, d2, np.abs(d2).max(1, keepdims=True), (d2 ** 4).mean(1, keepdims=True)])


def c2st(real, twin, feat, model, seed=0, folds=5):
    """Cross-validated AUROC and accuracy of a classifier separating real (label 1) from twin (label 0) rows."""
    X = features(np.vstack([real, twin]), feat)
    y = np.r_[np.ones(len(real)), np.zeros(len(twin))].astype(int)
    if model == "logreg":
        clf = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, C=0.1))
    elif model == "gboost":
        clf = HistGradientBoostingClassifier(max_iter=150, learning_rate=0.1, random_state=seed)
    else:
        raise ValueError(model)
    cv = StratifiedKFold(folds, shuffle=True, random_state=seed)
    p = cross_val_predict(clf, X, y, cv=cv, method="predict_proba")[:, 1]
    return roc_auc_score(y, p), float(((p > 0.5) == y).mean())


def paired_rmse(th0, real_clean, visc, coul):
    """Conventional fidelity: RMSE between the twin's noise-free trajectory and the real one from the same start."""
    return float(np.sqrt(((simulate(th0, visc, coul) - real_clean) ** 2).mean()))
