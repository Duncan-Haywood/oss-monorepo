"""Milestone 3f: first-order conditioning of f on a known k1 (experiments/m3f_condk1/analyse.py)."""
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3f_condk1"))
import analyse  # noqa: E402


def test_conditioning_matches_gaussian_regression():
    rng = np.random.default_rng(3)
    sf, sk, rho = 4.0, 0.01, 0.8
    C = np.array([[sf ** 2, rho * sf * sk], [rho * sf * sk, sk ** 2]])
    x = rng.multivariate_normal([500.0, 0.2], C, size=200000)
    near = np.abs(x[:, 1] - 0.21) < 0.0005          # samples with k1 close to 0.21
    pred = analyse.conditioned_f(500.0, 0.2, 0.21, sf, sk, rho)
    assert abs(x[near, 0].mean() - pred) < 0.15
    assert abs(x[near, 0].std() - analyse.conditional_sd(sf, rho)) < 0.15


def test_scale_of_covariance_cancels():
    a = analyse.conditioned_f(500, 0.1, 0.2, 4.0, 0.01, 0.7)
    b = analyse.conditioned_f(500, 0.1, 0.2, 36.0, 0.09, 0.7)
    assert abs(a - b) < 1e-9


def test_no_correlation_no_change():
    assert analyse.conditioned_f(500, 0.1, 0.3, 4.0, 0.01, 0.0) == 500
    assert analyse.conditional_sd(2.0, 0.0) == 2.0


def test_ols_recovers_line():
    x = np.linspace(-1, 1, 50)
    b, r2 = analyse.ols(0.3 + 2 * x, [x])
    assert np.allclose(b, [0.3, 2]) and r2 > 0.999
