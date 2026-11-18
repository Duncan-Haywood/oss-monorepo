"""Milestone 3l: the gyro-aided rolling-shutter window model (experiments/m3l_gyro/rsba.py)."""
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3l_gyro"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3k_shutter"))
import rsba  # noqa: E402
import rs  # noqa: E402
from rs import nfba  # noqa: E402

INTR = np.array([518.28, 315.7, 260.1, 0.25, -0.75])


def pts(n=300, seed=0):
    rng = np.random.default_rng(seed)
    z = rng.uniform(1.5, 5.0, n)
    return np.c_[rng.uniform(-0.6, 0.6, n) * z, rng.uniform(-0.45, 0.45, n) * z, z]


def test_zero_tau_is_the_global_shutter_projection():
    X = pts()
    n = len(X)
    rv, tv = np.tile([0.05, -0.1, 0.02], (n, 1)), np.tile([0.1, 0.0, -0.05], (n, 1))
    a = rsba.project(INTR, rv, tv, X, np.tile([1.0, 0.5, 0.2], (n, 1)), np.tile([0.3, 0, 0], (n, 1)), np.zeros(n))
    b, _ = nfba.project(INTR, rv, tv, X)
    assert np.allclose(a, b, atol=1e-9)


def test_matches_the_generator_at_its_own_row_times():
    """At the generator's row times (origin c_y) the explicit model reproduces milestone 3k's camera."""
    X = pts()
    n = len(X)
    w, u = np.array([0.8, -0.5, 0.3]), np.array([0.2, -0.1, 0.3])
    rv, tv = np.array([0.05, -0.1, 0.02]), np.array([0.1, 0.0, -0.05])
    uv, _, tau = rs.project_rs(INTR, rv, tv, X, w, u, 1 / 30, iters=20)
    pr = rsba.project(INTR, np.tile(rv, (n, 1)), np.tile(tv, (n, 1)), X, np.tile(w, (n, 1)), np.tile(u, (n, 1)), tau)
    assert np.abs(pr - uv).max() < 1e-6


def _window(t_r, w_true, seed=0, nv=6):
    rng = np.random.default_rng(seed)
    X = pts(250, seed)
    rv = np.c_[np.linspace(0, 0.15, nv), np.linspace(0, -0.1, nv), np.zeros(nv)]
    tv = np.c_[np.linspace(0, 0.3, nv), np.linspace(0, 0.05, nv), np.zeros(nv)]
    vi, pi, uv = [], [], []
    for v in range(nv):
        p, z, _ = rs.project_rs(INTR, rv[v], tv[v], X, w_true[v], np.zeros(3), t_r, iters=20)
        ok = (p[:, 0] > 0) & (p[:, 0] < 640) & (p[:, 1] > 0) & (p[:, 1] < 480)
        for k in np.nonzero(ok)[0]:
            vi.append(v); pi.append(k); uv.append(p[k])
    vi, pi, uv = np.array(vi), np.array(pi), np.array(uv) + rng.normal(0, 0.1, (len(uv), 2))
    return vi, pi, uv, rv, tv, X


def test_known_shutter_recovers_f_noise_small():
    nv = 6
    w = np.tile([1.0, 0.0, 0.0], (nv, 1))
    vi, pi, uv, rv, tv, X = _window(1 / 30, w)
    win = rsba.Window(vi, pi, uv, nv, len(X), tv, w, 1 / 30)
    out = win.solve(INTR * [1.02, 1, 1, 1, 1], rv, tv, X)
    assert abs(out["intr"][0] / INTR[0] - 1) < 0.003


def test_free_readout_is_recovered():
    nv = 6
    w = np.random.default_rng(3).normal(0, 1.0, (nv, 3))
    vi, pi, uv, rv, tv, X = _window(1 / 30, w)
    win = rsba.Window(vi, pi, uv, nv, len(X), tv, w, 0.0, est_tr=True)
    out = win.solve(INTR, rv, tv, X, t_r0=0.0)
    assert abs(out["t_r"] * 30 - 1) < 0.1
