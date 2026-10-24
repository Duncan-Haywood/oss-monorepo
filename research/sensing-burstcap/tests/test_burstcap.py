import numpy as np
from sensing_burstcap import frames_needed, max_area_ratio, signal_for_area_ratio


def test_shot_limit_is_k():
    assert abs(max_area_ratio(1e9, 2, 8) - 8) < 1e-6


def test_read_limit_is_sqrt_k():
    assert abs(max_area_ratio(1e-9, 3, 16) - 4) < 1e-6


def test_inverse_of_frames_needed():
    for K in (4, 8, 15):
        for r in (1, 3, 10):
            for e in (1, 30, 1000):
                assert abs(frames_needed(e, r, max_area_ratio(e, r, K)) - K) < 1e-9


def test_monotone_in_light():
    vals = [max_area_ratio(e, 3, 8) for e in (1, 10, 100, 1000)]
    assert vals == sorted(vals)


def test_signal_roundtrip_and_none():
    e = signal_for_area_ratio(3, 8, 4)
    assert abs(max_area_ratio(e, 3, 8) - 4) < 1e-9
    assert signal_for_area_ratio(3, 8, 2) is None and signal_for_area_ratio(3, 8, 8) is None


def test_monte_carlo_matches_closed_form():
    rng = np.random.default_rng(1)
    e, r, K = 30.0, 3.0, 8
    A = max_area_ratio(e, r, K)
    n = 100000
    b = (rng.poisson(e, (n, K)) + r * rng.standard_normal((n, K))).mean(1).var()
    l = ((rng.poisson(A * e, n) + r * rng.standard_normal(n)) / A).var()
    assert abs(b / l - 1) < 0.03
