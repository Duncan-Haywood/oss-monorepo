import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_nees.model import (G, DT, calibrate_scale, filter_spec_oracle, filter_spec_white,
                                monte_carlo, nees, covariance_run, adev, rw_from_allan)

N = 70e-6 * G


def test_white_only_covariance_matches_analytic_growth():
    # No GNSS from the start: position variance of a double-integrated white accel is N^2 t^3/3.
    spec = filter_spec_white(N)
    F, g, gains, blocks, nw = covariance_run(spec, 0.0, 100.0)
    p0 = 10.0 ** 2 + 100.0 ** 2 * 1.0 ** 2   # initial pos var + (initial vel var) t^2
    want = p0 + N ** 2 * 100.0 ** 3 / 3.0
    assert abs(blocks[-1][0, 0] / want - 1) < 0.02


def test_white_noise_allan_deviation_is_density_over_root_tau():
    x = np.random.default_rng(0).standard_normal(400_000) * N / np.sqrt(DT)
    assert abs(adev(x, 10.0) / (N / np.sqrt(10.0)) - 1) < 0.1


def test_calibration_hits_the_allan_floor():
    B = 100e-6 * G
    sc = calibrate_scale(B, N, n=400_000, grid=(10, 30, 100))
    rng = np.random.default_rng(1)
    from sensing_nees.model import _series
    x = _series(sc, N, 400_000, rng)
    assert 0.6 < min(adev(x, t) for t in (10, 30, 100)) / B < 1.6


def test_oracle_filter_is_consistent():
    B = 100e-6 * G
    sc = calibrate_scale(B, N, n=400_000, grid=(10, 30, 100))
    t, pe, ve, bl = monte_carlo(filter_spec_oracle(sc, N), sc, N, warm=300.0, outage=60.0, R=300)
    for s in (10, 60):
        assert 0.8 < nees(pe, ve, bl, int(s / DT) - 1) < 1.25


def test_white_only_filter_is_overconfident():
    B = 100e-6 * G
    sc = calibrate_scale(B, N, n=400_000, grid=(10, 30, 100))
    t, pe, ve, bl = monte_carlo(filter_spec_white(N), sc, N, warm=300.0, outage=60.0, R=200)
    assert nees(pe, ve, bl, int(60 / DT) - 1) > 20


def test_rw_read_off_is_zero_when_white_explains_the_curve():
    assert rw_from_allan(N / np.sqrt(10.0) * 0.99, 10.0, N) == 0.0
