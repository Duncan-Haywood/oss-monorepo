import math
import numpy as np
from ambient_driftwindow import (ar1, wake_positions, drift_path, cox_counts, window_sums, fano, fano_theory,
                                 log_rate_fit, block_counts, framelevel_window_counts)


def test_ar1_moments_and_autocorrelation():
    s = ar1(0.9, 400_000, np.random.default_rng(1))
    assert abs(s.std() - 1) < 0.03
    assert abs(np.corrcoef(s[:-1], s[1:])[0, 1] - 0.9) < 0.01


def test_wake_positions_counts_run_when_it_reaches_m():
    s = np.array([0, 5, 5, 5, 5, 0, 5, 0, 5, 5, 5, 0.0])
    assert list(wake_positions(s, 1.0, 3)) == [3, 10]


def test_drift_path_sd_and_correlation_time():
    x = drift_path(300_000, 0.1, 50, np.random.default_rng(2))
    assert abs(x.std() - 0.1) < 0.01
    assert abs(np.corrcoef(x[:-50], x[50:])[0, 1] - math.exp(-1)) < 0.03
    assert np.all(drift_path(10, 0.0, 5, np.random.default_rng(0)) == 0)


def test_iid_drift_is_uncorrelated():
    x = drift_path(200_000, 0.1, 0, np.random.default_rng(3))
    assert abs(np.corrcoef(x[:-1], x[1:])[0, 1]) < 0.01


def test_window_sums_drops_remainder():
    assert list(window_sums(np.arange(7), 3)) == [3, 12]


def test_log_rate_fit_recovers_exponential_rate():
    g = np.linspace(-0.4, 0.4, 9)
    f = log_rate_fit(g, 3.0 * np.exp(5 * g))
    assert abs(f(0.1) - 3.0 * math.exp(0.5)) < 1e-6


def test_no_drift_cox_counts_are_poisson():
    c = cox_counts(lambda x: np.full_like(x, 5.0), 0.0, 10, 200_000, np.random.default_rng(4))
    assert abs(fano(c) - 1) < 0.03


def test_theory_limits():
    assert fano_theory(5.0, 0.0, 0.9, 16) == 1.0
    # one-block window: 1 + lam * cv^2
    assert abs(fano_theory(5.0, 0.2, 0.9, 1) - 1.2) < 1e-12
    # fully persistent drift: variance of the window sum is (k*cv)^2 lam^2, so Fano -> 1 + lam*cv^2*k
    assert abs(fano_theory(5.0, 0.2, 1.0, 16) - (1 + 5 * 0.04 * 16)) < 1e-9
    # i.i.d. drift: Fano does not depend on k
    assert abs(fano_theory(5.0, 0.2, 0.0, 16) - 1.2) < 1e-12


def test_cox_matches_theory_for_exponential_rate():
    rate = lambda x: 4.0 * np.exp(3 * x)
    sg, tau, k = 0.1, 20, 8
    c = window_sums(cox_counts(rate, sg, tau, 1_600_000, np.random.default_rng(5)), k)
    z = np.random.default_rng(6).standard_normal(400_000) * sg
    r = rate(z)
    th = fano_theory(r.mean(), r.std() / r.mean(), math.exp(-1 / tau), k)
    assert abs(fano(c) - th) / th < 0.1   # the lognormal rate's autocorrelation is not exactly rho^lag


def test_framelevel_matches_block_counts_without_drift():
    c = framelevel_window_counts(1.5, 0.9, 3, 2000, 5, 40, 0.0, 10, seed=1)
    assert c.shape == (40,) and c.min() >= 0
    one = block_counts(1.5, 0.9, 3, 2000, np.ones(200), np.random.default_rng(1)).mean() * 5
    assert abs(c.mean() - one) / one < 0.25
