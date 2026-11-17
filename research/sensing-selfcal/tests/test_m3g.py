"""Milestone 3g: first-order conditioning of f on known (k1, k2) (experiments/m3g_condk12/analyse.py)."""
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
import importlib.util  # noqa: E402

sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3d_pool"))
_spec = importlib.util.spec_from_file_location(
    "m3g_analyse", os.path.join(HERE, "..", "experiments", "m3g_condk12", "analyse.py"))
analyse = importlib.util.module_from_spec(_spec)   # loaded by path: every milestone's script is analyse.py
_spec.loader.exec_module(analyse)


def _cov(seed=1):
    rng = np.random.default_rng(seed)
    L = rng.normal(size=(5, 5)) * np.array([4.0, 1.5, 2.0, 0.01, 0.01])[:, None]
    return L @ L.T + np.diag([1.0, 0.5, 0.5, 1e-5, 1e-5])


def test_two_term_matches_monte_carlo():
    C = _cov()
    mu = np.array([500.0, 320.0, 240.0, 0.1, -0.2])
    x = np.random.default_rng(4).multivariate_normal(mu, C, size=400000)
    ref = (0.105, -0.195)
    sd = np.sqrt(np.diag(C))
    near = (np.abs(x[:, 3] - ref[0]) < 0.08 * sd[3]) & (np.abs(x[:, 4] - ref[1]) < 0.08 * sd[4])
    fc, ratio = analyse.condition(mu, C, ("k1", "k2"), ref)
    assert near.sum() > 500
    assert abs(x[near, 0].mean() - fc) < 0.1 * sd[0]
    assert abs(x[near, 0].std() / sd[0] - ratio) < 0.05


def test_one_term_matches_bivariate_formula():
    C = _cov(2)
    mu = np.array([500.0, 320.0, 240.0, 0.1, -0.2])
    sd = np.sqrt(np.diag(C))
    rho = C[0, 3] / (sd[0] * sd[3])
    fc, ratio = analyse.condition(mu, C, ("k1",), (0.15,))
    assert abs(fc - (500 + rho * sd[0] / sd[3] * (0.15 - 0.1))) < 1e-9
    assert abs(ratio - np.sqrt(1 - rho ** 2)) < 1e-12


def test_scale_cancels_and_no_move_at_reference():
    C = _cov(3)
    mu = np.array([500.0, 320.0, 240.0, 0.1, -0.2])
    a = analyse.condition(mu, C, ("k1", "k2"), (0.2, -0.1))
    b = analyse.condition(mu, 81 * C, ("k1", "k2"), (0.2, -0.1))
    assert np.allclose(a, b)
    assert analyse.condition(mu, C, ("k1", "k2"), (0.1, -0.2))[0] == 500.0


def test_uncorrelated_terms_leave_f():
    C = np.diag([16.0, 2.0, 4.0, 1e-4, 1e-4])
    assert analyse.condition([500, 320, 240, 0.1, -0.2], C, ("k1", "k2"), (0.3, 0.3)) == (500.0, 1.0)
