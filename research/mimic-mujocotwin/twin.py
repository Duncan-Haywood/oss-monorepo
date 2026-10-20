"""MuJoCo pendulum 'real system', its sim-to-sim twins, and the classifier two-sample test (C2ST).

Real = MuJoCo RK4 at a fine timestep with joint damping, Coulomb (dry) friction and Student-t sensor noise.
A twin is the same model with a coarser integrator or timestep, or a changed friction. All simulated, no real data.
The C2ST is the one of ../mimic-twinc2st (Lopez-Paz and Oquab 2017), re-implemented here so the project is self-contained.
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


def features(x):
    """Raw angles plus second differences and two summaries of them (as in mimic-twinc2st's best detector)."""
    d2 = x[:, 2:] - 2 * x[:, 1:-1] + x[:, :-2]
    return np.hstack([x, d2, np.abs(d2).max(1, keepdims=True), (d2 ** 4).mean(1, keepdims=True)])


def c2st(real, twin, seed=0, folds=5):
    """Cross-validated AUROC of boosted trees separating real (label 1) from twin (label 0) rows."""
    X = features(np.vstack([real, twin]))
    y = np.r_[np.ones(len(real)), np.zeros(len(twin))].astype(int)
    clf = HistGradientBoostingClassifier(max_iter=150, learning_rate=0.1, random_state=seed)
    cv = StratifiedKFold(folds, shuffle=True, random_state=seed)
    p = cross_val_predict(clf, X, y, cv=cv, method="predict_proba")[:, 1]
    return float(roc_auc_score(y, p))


def paired_rmse(a_clean, b_clean):
    """Conventional fidelity: RMSE between two noise-free trajectory sets started from the same angles."""
    return float(np.sqrt(((a_clean - b_clean) ** 2).mean()))
