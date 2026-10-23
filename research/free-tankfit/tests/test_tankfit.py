import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from tankfit import *  # noqa


def test_windows_inside_range_and_right_length():
    for a, b in windows(1024, 768, 200, np.random.default_rng(1)):
        assert b - a == 768 and 0 <= a and b <= 1024


def test_windows_cover_both_ends():
    w = windows(1024, 768, 500, np.random.default_rng(2))
    assert min(a for a, _ in w) < 20 and max(a for a, _ in w) > 236


def test_summarize_matches_numpy():
    x = np.arange(101.0)
    s = summarize(x)
    assert s["mean"] == 50 and abs(s["lo"] - 2.5) < 1e-9 and abs(s["hi"] - 97.5) < 1e-9


def test_twin_recovers_parameters_from_its_own_output():
    # analytic-case check: noiseless twin data -> refit reproduces the output
    u = np.r_[np.full(60, 2.0), np.full(60, 4.0), np.full(60, 1.0)]
    th = np.array([0.08, 0.07, 0.06, 0.0, 3.0, 2.0])
    y = twin_sim(th, u, False)
    fit = fit_twin(u, y, False)
    assert rmse(twin_sim(fit, u, False), y) < 1e-2


def test_arx_exact_on_linear_system():
    rng = np.random.default_rng(0)
    u = rng.normal(size=200); y = np.zeros(200)
    for t in range(1, 200):
        y[t] = 0.8 * y[t - 1] + 0.5 * u[t - 1]
    m = fit_narx(u, y, 4, 4, 1)
    assert rmse(narx_sim(m, u, y)[4:], y[4:]) < 1e-4
