import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import buckreal as b  # noqa: E402


def test_data_shapes_and_contiguous_split():
    u, y = b.load("buck_id"); uv, yv = b.load("buck_valid")
    assert len(u) == 1001 and len(uv) == 999
    assert 11.0 <= y.min() and yv.max() <= 16.6


def test_lti2_unit_dc_gain_and_analytic_overshoot():
    wn, zeta = 5e3, 0.35
    y = b.lti2(np.ones(4000), wn, zeta)
    assert abs(y[-1] - 1) < 1e-3
    # step overshoot of a 2nd-order lag: exp(-pi zeta / sqrt(1 - zeta^2))
    assert abs((y.max() - 1) - np.exp(-np.pi * zeta / np.sqrt(1 - zeta ** 2))) < 1e-3


def test_arx_recovers_known_system():
    rng = np.random.default_rng(0)
    u = rng.normal(size=400); y = np.zeros(400)
    for t in range(2, 400):
        y[t] = 0.6 * y[t - 1] - 0.1 * y[t - 2] + 0.5 * u[t - 1] + 0.2
    th = b.fit_arx(u, y, 2, 2)
    assert np.allclose(th, [-0.6, 0.1, 0.5, 0.0, 0.2], atol=1e-8)
    assert b.rmse(b.sim_arx(th, u, y, 2, 2), y, 2) < 1e-8


def test_twin_fit_recovers_simulated_parameters():
    rng = np.random.default_rng(1)
    u = 2.35 + 0.15 * np.sign(np.sin(np.arange(1000) / 80.0)) + 0.01 * rng.normal(size=1000)
    p = [6e3, 0.4, 13.0, -8.0, -60.0]
    y = b.twin_sim(p, u)
    q = b.fit_twin(u, y)
    assert abs(q[0] - p[0]) / p[0] < 0.02 and abs(q[1] - p[1]) < 0.02
    assert b.rmse(b.twin_sim(q, u), y) < 1e-3


def test_constant_baseline_far_above_quantisation_floor():
    u, y = b.load("buck_id"); uv, yv = b.load("buck_valid")
    assert b.rmse(np.full_like(yv, y.mean()), yv) > 20 * 0.2 / 12 ** 0.5
