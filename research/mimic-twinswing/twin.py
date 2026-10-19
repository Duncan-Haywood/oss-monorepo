"""Pendulum 'real system', its digital twins, and a swing-up task whose controller depends on friction.

Same pendulum, noise models, twins and C2ST as `research/mimic-twinregret/twin.py` (copied, so this project stands
alone). The task differs: the torque limit (UMAX = 4) is below gravity's pull (g/L = 9.81), so the pendulum cannot be
lifted directly. The controller must pump energy by pushing along the measured velocity, then catch the top with PD.
Pumping has to beat Coulomb and viscous friction, so, unlike the stabilisation task of `mimic-twinregret`, a twin with
the wrong friction should tune the pump gain wrongly. Everything is stylised and simulated: no real data.
"""
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict

DT, STEPS = 0.02, 100          # passive trajectories for the C2ST (same as mimic-twinregret)
TSTEPS = 400                   # swing-up episode: 8 s
UMAX, U_COST = 4.0, 0.002
G_NOM = 9.81                   # the controller's own gravity constant in its energy estimate (not tuned on the twin)
VF = 0.3                       # low-pass factor on the differenced velocity estimate
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


def wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi


def swing_cost(starts, gains, p, rng):
    """Mean cost of swing-up controllers on system p, for every gain tuple at once. Returns shape (len(gains),).

    gains are (ke, kp, kd, cap): pump u = ke*(E_top - E)*sign(w_hat) with E = w_hat^2/2 - G_NOM*cos(theta_hat), then
    PD u = -kp*e - kd*w_hat on e = wrap(theta_hat - pi) once |e| < cap. u is clipped to +-UMAX. The controller sees
    theta + sensor noise and a low-pass (VF) differenced velocity. starts = (theta0, w0), shape (2, n).
    Cost per start = mean over time of (1 + cos theta)/2 (0 at the top, 1 hanging) + U_COST*u^2. The same noise draw is
    used for every gain tuple (common random numbers).
    """
    ke, kp, kd, cap = (np.asarray([g[i] for g in gains])[:, None] for i in range(4))
    th0, w0 = starts
    n = len(th0)
    th = np.broadcast_to(th0, (len(gains), n)).copy()
    w = np.broadcast_to(w0, (len(gains), n)).copy()
    eps = noise(rng, (TSTEPS + 1, n), p["sd"], p["kind"])
    prev = th0 + eps[0]
    wh = np.zeros_like(th)
    cost = np.zeros_like(th)
    for t in range(TSTEPS):
        meas = th + eps[t + 1]
        wh = (1 - VF) * wh + VF * (meas - prev) / DT
        e = wrap(meas - np.pi)
        pump = ke * (G_NOM - (0.5 * wh ** 2 - G_NOM * np.cos(meas))) * np.sign(wh)
        u = np.clip(np.where(np.abs(e) < cap, -kp * e - kd * wh, pump), -UMAX, UMAX)
        cost += (1 + np.cos(th)) / 2 + U_COST * u ** 2
        th, w = _rk4(th, w, u, p, DT)
        prev = meas
    return (cost / TSTEPS).mean(1)


def gain_grid(kes=(0.5, 1.0, 2.0, 4.0, 8.0), kps=(10.0, 20.0, 40.0), kds=(1.0, 2.0, 4.0), caps=(0.4, 0.8)):
    return [(a, b, c, d) for a in kes for b in kps for c in kds for d in caps]


def draw_starts(rng, n):
    return rng.uniform(-0.3, 0.3, n), rng.uniform(-0.5, 0.5, n)


def tune(p, rng, n=150, gains=None):
    """Grid-search the controller that minimises swing cost on system p over n fresh starts. Returns (index, gains)."""
    gains = gains or gain_grid()
    return int(np.argmin(swing_cost(draw_starts(rng, n), gains, p, rng))), gains


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
