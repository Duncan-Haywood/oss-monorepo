import math

import numpy as np
from capture_sync.gate import binom_cdf, ltt_threshold, naive_threshold, apply_gate


def test_binom_cdf_matches_direct_sum():
    m, p = 30, 0.07
    for k in (0, 3, 10, 29):
        direct = sum(math.comb(m, i) * p ** i * (1 - p) ** (m - i) for i in range(k + 1))
        assert abs(binom_cdf(k, m, p) - direct) < 1e-12
    assert binom_cdf(-1, 5, 0.1) == 0.0 and binom_cdf(5, 5, 0.1) == 1.0


def test_binom_cdf_large_m_is_finite():
    v = binom_cdf(50, 10000, 0.01)  # mean 100: far in the lower tail
    assert 0.0 < v < 1e-5


def _sample(n, seed):
    # failure probability falls with the score: P(bad | s) = 0.3 exp(-s / 5)
    rng = np.random.default_rng(seed)
    s = rng.exponential(10.0, n)
    bad = rng.random(n) < 0.3 * np.exp(-s / 5)
    return s, bad


def test_ltt_controls_failure_among_accepted_with_probability_1_minus_delta():
    grid = np.geomspace(0.5, 100, 200)
    s_big, b_big = _sample(400_000, 99)
    viol = 0
    for seed in range(60):
        s, b = _sample(3000, seed)
        lam = ltt_threshold(s, b, grid, alpha=0.02, delta=0.1)
        if np.isfinite(lam):
            keep = s_big >= lam
            viol += b_big[keep].mean() > 0.02
    assert viol / 60 <= 0.2  # bound is 0.1; slack for 60 repeats


def test_ltt_is_stricter_than_naive_and_abstains_when_hopeless():
    grid = np.geomspace(0.5, 100, 200)
    s, b = _sample(3000, 5)
    assert ltt_threshold(s, b, grid, 0.02, 0.1) >= naive_threshold(s, b, grid, 0.02)
    allbad = np.ones(100, bool)
    assert ltt_threshold(np.arange(100.0), allbad, grid, 0.01, 0.1) == float("inf")


def test_apply_gate():
    kept, fk, n = apply_gate([1, 2, 3, 4], [True, False, True, False], 3)
    assert (kept, fk, n) == (0.5, 0.5, 2)
    assert np.isnan(apply_gate([1, 2], [0, 0], 9)[1])
