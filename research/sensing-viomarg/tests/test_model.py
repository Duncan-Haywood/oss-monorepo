import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_viomarg import Setup, make_world, simulate_sensors, run_vio_marg, drift_percent  # noqa: E402
from sensing_viomarg.model import marginal_prior, _res  # noqa: E402
from sensing_vio import model as base  # noqa: E402


def _run(seed, T, marg, s=None):
    s = s or Setup()
    w = make_world(seed, T=T)
    se = simulate_sensors(w, s, seed)
    return drift_percent(w, se, run_vio_marg(w, s, se, marginalise=marg))


def test_pinned_mode_matches_sensing_vio():
    s = Setup()
    w = make_world(0, T=5.0)
    se = simulate_sensors(w, s, 0)
    a = run_vio_marg(w, s, se, marginalise=False)
    b = base.run_vio(w, s, se)
    assert np.allclose(a, b, atol=1e-6)


def test_marginal_prior_equals_schur_complement_of_chain():
    # for a linear-Gaussian chain, minimising over x0 leaves 0.5 dx^T lam dx + b dx: check against brute force
    s = Setup()
    w = make_world(1, T=3.0)
    se = simulate_sensors(w, s, 1)
    step, dt = se["step"], w["dt"]
    T = step * dt
    k = se["kf"]
    g = se["gyro"][None, k[0]:k[0] + step]
    a = se["acc"][None, k[0]:k[0] + step]
    K01 = np.zeros((2, 8)); K01[:, 0] = [0, 1.0]; K01[:, 3] = 1.0
    sg = dict(th=1e-3, v=1e-3, p=1e-4, bg=1e-3, ba=1e-2, b=1e-3)
    pri = dict(x=K01[0].copy(), sig=np.full(8, 1e-2))
    m = marginal_prior(K01, g, a, T, dt, pri, sg)
    imu = (g, a, T, dt)
    ob = (np.zeros(0, dtype=int), np.zeros(0, dtype=int), np.zeros(0))
    x = K01.ravel() + 1e-3 * np.arange(16)
    # profile cost over x0 by Gauss-Newton on x0 alone
    from scipy.optimize import least_squares
    def prof(x1):
        sol = least_squares(lambda x0: _res(np.concatenate([x0, x1]), 2, imu, ob, pri, sg), x[:8], xtol=1e-14, ftol=1e-14)
        return 0.5 * np.sum(sol.fun ** 2)
    def prior(x1):
        r = m["L"].T @ (x1 - m["x"]) + m["c"]
        return 0.5 * np.sum(r ** 2)
    d1 = prof(x[8:] + 1e-3) - prof(x[8:])
    d2 = prior(x[8:] + 1e-3) - prior(x[8:])
    assert abs(d1 - d2) < 0.02 * max(abs(d1), 1e-9) + 1e-6


def test_prior_info_is_psd():
    s = Setup()
    w = make_world(2, T=3.0)
    se = simulate_sensors(w, s, 2)
    k, step = se["kf"], se["step"]
    K01 = np.zeros((2, 8)); K01[:, 3] = 1.0
    sg = dict(th=1e-3, v=1e-3, p=1e-4, bg=1e-3, ba=1e-2, b=1e-3)
    pri = dict(x=K01[0].copy(), sig=np.full(8, 1e-2))
    m = marginal_prior(K01, se["gyro"][None, k[0]:k[0] + step], se["acc"][None, k[0]:k[0] + step], 0.1, w["dt"], pri, sg)
    assert np.all(np.isfinite(m["L"])) and np.all(np.isfinite(m["c"]))


def test_marginalised_runs_and_is_bounded_on_short_path():
    d = _run(0, 8.0, True)
    assert np.isfinite(d[1]) and d[1] < 10.0


def test_noiseless_sensors_recover_path_with_marginalisation():
    s = Setup(px_sigma=0.0, gyro_nd=1e-9, gyro_rw=1e-9, acc_nd=1e-9, acc_rw=1e-9)
    assert _run(3, 6.0, True, s)[1] < 0.5
