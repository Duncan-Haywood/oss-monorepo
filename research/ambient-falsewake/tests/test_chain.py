import math
import numpy as np
from ambient_falsewake import wake_rate, independent_rate, simulate_rate, threshold_for_rate, FRAMES_PER_DAY
from ambient_falsewake.chain import _ar1_fast, _ncdf


def test_phi_zero_matches_independent():
    for theta in (1.0, 2.0, 3.0):
        p = 1 - _ncdf(theta)
        assert math.isclose(wake_rate(theta, 0.0, 1), p * (1 - p), rel_tol=2e-3)
        assert math.isclose(wake_rate(theta, 0.0, 3), p ** 3 * (1 - p), rel_tol=2e-3)


def test_single_frame_rule_is_nearly_insensitive_to_correlation():
    # m=1 counts upcrossings; a rough AR(1) score crosses almost as often as white noise
    assert 0.4 < wake_rate(4.0, 0.9, 1) / wake_rate(4.0, 0.0, 1) < 1.0


def test_independent_product_rule_undercounts_multi_frame_wakes():
    m, phi = 3, 0.9
    th = threshold_for_rate(lambda t: independent_rate(t, m), 1 / FRAMES_PER_DAY)
    assert wake_rate(th, phi, m) * FRAMES_PER_DAY > 100


def test_matches_monte_carlo():
    theta, phi = 2.0, 0.8
    for m in (1, 3):
        exact = wake_rate(theta, phi, m)
        mc = simulate_rate(theta, phi, m, 2_000_000, seed=3)
        assert abs(mc - exact) < 4 * math.sqrt(exact / 2_000_000 * 3) + 1e-9


def test_ar1_fast_has_right_moments():
    s = _ar1_fast(0.9, 400_000, np.random.default_rng(1))
    assert abs(s.mean()) < 0.05 and abs(s.std() - 1) < 0.03
    assert abs(np.corrcoef(s[:-1], s[1:])[0, 1] - 0.9) < 0.01


def test_threshold_for_rate_inverts():
    f = lambda th: wake_rate(th, 0.9, 1)
    th = threshold_for_rate(f, 1 / FRAMES_PER_DAY)
    assert 4.0 < th < 6.0
    # the grid makes the rate a step function of theta (cell width 0.0133)
    assert math.isclose(f(th), 1 / FRAMES_PER_DAY, rel_tol=0.1)
