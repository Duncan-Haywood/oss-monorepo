"""Pendulum 'real system', its digital twins, a noisy-feedback PD task, and the fidelity scores to compare.

Adapted from `research/mimic-twinc2st/twin.py` (same pendulum, noise models and C2ST), extended with a torque input and
a controller so the project can ask whether a fidelity score predicts what a controller tuned on the twin costs on the
real system. Everything is stylised and simulated: no real data.
"""
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict

DT, STEPS = 0.02, 100
UMAX, U_COST = 6.0, 0.002
REAL = dict(visc=0.1, coul=0.3, sd=0.02, kind="student3", glo=9.81)


def _rk4(th, w, u, p, dt):
    def f(th, w):
        return w, -p["glo"] * np.sin(th) - p["visc"] * w - p["coul"] * np.tanh(w / 0.05) + u
    k1 = f(th, w)
    k2 = f(th + dt / 2 * k1[0], w + dt / 2 * k1[1])
    k3 = f(th + dt / 2 * k2[0], w + dt / 2 * k2[1])
    k4 = f(th + dt * k3[0], w + dt * k3[1])
    return th + dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), w + dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])


def noise(rng, shape, sd, kind):
    """Zero-mean noise with standard deviation sd. 'gauss' or 'student3' (df=3, rescaled to the same sd)."""
    if kind == "gauss":
        return rng.normal(0, sd, shape)
    if kind == "student3":
        return rng.standard_t(3, shape) * sd / np.sqrt(3.0)  # Var(t3) = 3
    raise ValueError(kind)


def passive(rng, n, p):
    """Open-loop (u = 0) noisy trajectories, shape (n, STEPS), plus start angles and the noise-free trajectories."""
    th0 = rng.uniform(-2.0, 2.0, n)
    th, w = th0.copy(), np.zeros(n)
    out = np.empty((n, STEPS))
    for t in range(STEPS):
        out[:, t] = th
        th, w = _rk4(th, w, 0.0, p, DT)
    return th0, out, out + noise(rng, out.shape, p["sd"], p["kind"])


def closed_loop_cost(th0, gains, p, rng):
    """Mean cost of PD gains on system p, for every gain pair at once. Returns shape (len(gains),).

    The controller sees theta + sensor noise and differences it for velocity: u = clip(-kp*th_hat - kd*w_hat, +-UMAX).
    Cost per start angle = mean over time of true theta^2 + U_COST * u^2.  The same noise draw is used for every gain
    pair (common random numbers), so differences between gains are not noise-chasing.
    """
    kp = np.asarray([g[0] for g in gains])[:, None]
    kd = np.asarray([g[1] for g in gains])[:, None]
    n = len(th0)
    th = np.broadcast_to(th0, (len(gains), n)).copy()
    w = np.zeros_like(th)
    eps = noise(rng, (STEPS + 1, n), p["sd"], p["kind"])  # shared across gains
    prev = th0 + eps[0]
    cost = np.zeros_like(th)
    for t in range(STEPS):
        meas = th + eps[t + 1] if t else th + eps[0]
        w_hat = (meas - prev) / DT if t else 0.0
        u = np.clip(-kp * meas - kd * w_hat, -UMAX, UMAX)
        cost += th ** 2 + U_COST * u ** 2
        th, w = _rk4(th, w, u, p, DT)
        prev = meas
    return (cost / STEPS).mean(1)


def gain_grid(kps=(0.0, 2.0, 5.0, 10.0, 20.0, 40.0), kds=(0.0, 0.1, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0)):
    return [(a, b) for a in kps for b in kds]


def tune(p, rng, n=200, gains=None):
    """Grid-search the PD gains that minimise cost on system p over n fresh start angles. Returns (index, gains)."""
    gains = gains or gain_grid()
    th0 = rng.uniform(-2.0, 2.0, n)
    return int(np.argmin(closed_loop_cost(th0, gains, p, rng))), gains


def features(x):
    d2 = x[:, 2:] - 2 * x[:, 1:-1] + x[:, :-2]
    return np.hstack([x, d2, np.abs(d2).max(1, keepdims=True), (d2 ** 4).mean(1, keepdims=True)])


def c2st(real, twin, seed=0, folds=5):
    """Cross-validated AUROC of boosted trees on raw + second-difference features, real (1) vs twin (0)."""
    X = features(np.vstack([real, twin]))
    y = np.r_[np.ones(len(real)), np.zeros(len(twin))].astype(int)
    clf = HistGradientBoostingClassifier(max_iter=150, learning_rate=0.1, random_state=seed)
    cv = StratifiedKFold(folds, shuffle=True, random_state=seed)
    return float(roc_auc_score(y, cross_val_predict(clf, X, y, cv=cv, method="predict_proba")[:, 1]))


def paired_rmse(th0, real_clean, p):
    """Noise-free twin trajectory vs the noise-free real one from the same start angle (radians)."""
    n = len(th0)
    th, w = th0.copy(), np.zeros(n)
    out = np.empty((n, STEPS))
    for t in range(STEPS):
        out[:, t] = th
        th, w = _rk4(th, w, 0.0, p, DT)
    return float(np.sqrt(((out - real_clean) ** 2).mean()))
