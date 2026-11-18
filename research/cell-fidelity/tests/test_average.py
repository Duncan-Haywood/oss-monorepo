import importlib.util
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parents[1] / "experiments" / "average"
spec = importlib.util.spec_from_file_location("average_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_noiseless_is_one_call():
    assert run.expected_calls_gauss([100.0, 150.0, 120.0], 0.0) == 1.0
    assert run.expected_calls_gauss([100.0, 150.0, 120.0], 1e-6) == pytest.approx(1.0, abs=1e-6)


def test_two_designs_closed_form():
    # one outsider at gap d below the only tolerant design: P(outsider first) = Phi(-d / (sqrt 2 sigma))
    from scipy.stats import norm
    f, sigma = [100.0, 90.0], 7.0
    exp = 1 + norm.cdf(-10.0 / (np.sqrt(2) * sigma))
    assert run.expected_calls_gauss(f, sigma) == pytest.approx(exp, rel=1e-4)


def test_gauss_matches_monte_carlo():
    rng = np.random.default_rng(3)
    f = rng.uniform(80, 160, 40)
    sigma = 6.0
    mc = np.mean([run.calls_sim(f, rng.normal(0, sigma, len(f))) for _ in range(20000)])
    assert run.expected_calls_gauss(f, sigma) == pytest.approx(mc, rel=0.03)


def test_huge_noise_approaches_random_order():
    # with sigma -> infinity the order is random: E[R] = (N + 1) / (|T| + 1)
    f = [100.0, 99.5, 50.0, 40.0, 30.0, 20.0]       # |T| = 2 (99.5 >= 99)
    assert run.expected_calls_gauss(f, 1e5) == pytest.approx(7 / 3, rel=1e-3)


def test_affine_residual_removes_scale_and_shift():
    s = np.array([1.0, 2.0, 3.0, 4.0])
    a, b, e = run.affine_residual(s, 3 * s + 5)
    assert a == pytest.approx(3) and b == pytest.approx(5)
    assert np.allclose(e, 0)


def test_boot_with_zero_residuals_is_exact():
    rng = np.random.default_rng(0)
    assert run.expected_calls_boot([10.0, 20.0, 30.0], np.zeros(5), rng, draws=50) == 1.0
