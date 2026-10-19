import os
import sys
from dataclasses import replace
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_timesync import Setup, simulate, filter_rms, estimate_offset, predicted_rms_offset_error

S = Setup()


def run(s, td, seed=0, T=30.0, td_hat=0.0):
    return filter_rms(s, *simulate(s, T, td, np.random.default_rng(seed)), td_hat=td_hat)


def test_simulate_shapes_and_determinism():
    a = simulate(S, 10, 0.01, np.random.default_rng(1))
    b = simulate(S, 10, 0.01, np.random.default_rng(1))
    assert len(a[0]) == len(a[1]) == 2000 and len(a[2]) == len(a[3])
    assert all(np.array_equal(x, y) for x, y in zip(a, b))


def test_error_grows_with_offset():
    e = [run(S, td) for td in (0.0, 0.02, 0.06)]
    assert e[0] < e[1] < e[2]


def test_large_offset_near_first_order_bound():
    # for a big offset the camera is wrong by about omega*td; the filter error should be the same order
    td = 0.08
    assert 0.3 * predicted_rms_offset_error(S, td) < run(S, td) < 1.2 * predicted_rms_offset_error(S, td)


def test_faster_motion_is_more_sensitive():
    slow, fast = replace(S, omega_rms=10.0), replace(S, omega_rms=90.0)
    assert run(fast, 0.02) / run(fast, 0.0) > run(slow, 0.02) / run(slow, 0.0)


def test_estimator_recovers_offset_within_few_ms():
    for td in (0.0, 0.02, 0.05):
        est = estimate_offset(S, *simulate(S, 30, td, np.random.default_rng(7))[:4])
        assert abs(est - td) < 0.004


def test_correction_restores_error():
    td = 0.05
    hat = estimate_offset(S, *simulate(S, 30, td, np.random.default_rng(3))[:4])
    assert run(S, td, td_hat=hat) < 0.5 * run(S, td)
    assert run(S, td, td_hat=hat) < 1.3 * run(S, 0.0)


def test_estimator_degrades_without_motion():
    still = replace(S, omega_rms=1.0)
    errs = [abs(estimate_offset(still, *simulate(still, 30, 0.02, np.random.default_rng(k))[:4]) - 0.02) for k in range(4)]
    assert max(errs) > 0.01
