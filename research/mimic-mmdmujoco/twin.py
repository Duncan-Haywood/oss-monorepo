"""Kernel two-sample test (MMD) against a classifier two-sample test (C2ST) for MuJoCo pendulum twins.

Self-contained: the MuJoCo 'real system' and twins follow research/mimic-mujocotwin and the statistics follow
research/mimic-mmd (copied so this directory stands alone). Everything is simulated; no real data.
"""
import mujoco
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict

STEPS, SAMPLE_DT = 100, 0.02  # recorded every 0.02 s, 100 samples = 2 s

XML = """
<mujoco>
  <option gravity="0 0 -9.81"/>
  <worldbody>
    <body pos="0 0 0">
      <joint name="h" type="hinge" axis="0 1 0" damping="{damping}" frictionloss="{frictionloss}"/>
      <inertial pos="0 0 -0.5" mass="1" diaginertia="1e-4 1e-4 1e-4"/>
    </body>
  </worldbody>
</mujoco>
"""


def simulate(theta0, damping=0.025, frictionloss=0.075, integrator="rk4", dt=0.002):
    """Noise-free joint-angle trajectories, shape (n, STEPS), recorded every SAMPLE_DT seconds, released at rest."""
    m = mujoco.MjModel.from_xml_string(XML.format(damping=damping, frictionloss=frictionloss))
    m.opt.integrator = {"rk4": mujoco.mjtIntegrator.mjINT_RK4, "euler": mujoco.mjtIntegrator.mjINT_EULER}[integrator]
    sub = int(round(SAMPLE_DT / dt))
    if abs(sub * dt - SAMPLE_DT) > 1e-12:
        raise ValueError("dt must divide the 0.02 s sample interval")
    m.opt.timestep = dt
    d = mujoco.MjData(m)
    out = np.empty((len(theta0), STEPS))
    for i, th in enumerate(theta0):
        mujoco.mj_resetData(m, d)
        d.qpos[0] = th
        for t in range(STEPS):
            out[i, t] = d.qpos[0]
            for _ in range(sub):
                mujoco.mj_step(m, d)
    return out


def noise(rng, shape, sd, kind):
    """Zero-mean noise with standard deviation sd: 'gauss' or 'student3' (df 3, rescaled to the same sd)."""
    if kind == "gauss":
        return rng.normal(0, sd, shape)
    if kind == "student3":
        return rng.standard_t(3, shape) * sd / np.sqrt(3.0)
    raise ValueError(kind)


REAL = dict(integrator="rk4", dt=0.002, damping=0.025, frictionloss=0.075)
SD = 0.02


def sample(rng, n, kind="student3", **cfg):
    """n noisy trajectories with independent uniform start angles in [-2, 2]."""
    clean = simulate(rng.uniform(-2.0, 2.0, n), **cfg)
    return clean + noise(rng, clean.shape, SD, kind)


def features(x, kind):
    """'raw' trajectory, 'resid' (second differences: cancel smooth motion, keep noise) or 'both' (see below)."""
    if kind == "raw":
        return x
    if kind == "resid":
        return x[:, 2:] - 2 * x[:, 1:-1] + x[:, :-2]
    if kind == "both":  # as mimic-twinc2st's best detector: raw, second differences and two summaries of them
        d2 = x[:, 2:] - 2 * x[:, 1:-1] + x[:, :-2]
        return np.hstack([x, d2, np.abs(d2).max(1, keepdims=True), (d2 ** 4).mean(1, keepdims=True)])
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


def c2st_auc(real, twin, feat="raw", seed=0, folds=5):
    """Cross-validated AUROC of boosted trees separating real (label 1) from twin (label 0) rows."""
    X = features(np.vstack([real, twin]), feat)
    y = np.r_[np.ones(len(real)), np.zeros(len(twin))].astype(int)
    clf = HistGradientBoostingClassifier(max_iter=150, learning_rate=0.1, random_state=seed)
    cv = StratifiedKFold(folds, shuffle=True, random_state=seed)
    p = cross_val_predict(clf, X, y, cv=cv, method="predict_proba")[:, 1]
    return float(roc_auc_score(y, p))




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
