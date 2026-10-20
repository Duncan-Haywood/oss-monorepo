import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from dataclasses import replace
from sensing_syncskew import Setup, simulate, filter_rms, estimate_sync

S = Setup()


def sim(td0, skew, seed=0, T=30.0, s=S):
    return simulate(s, T, td0, skew, np.random.default_rng(seed))


def test_determinism_and_shapes():
    a, b = sim(0.01, 1e-4, 1, 10), sim(0.01, 1e-4, 1, 10)
    assert len(a[0]) == len(a[1]) == 2000 and len(a[2]) == len(a[3])
    assert all(np.array_equal(x, y) for x, y in zip(a, b))


def test_skew_raises_error():
    e = [filter_rms(S, *sim(0.0, k)) for k in (0.0, 1e-3)]
    assert e[1] > 1.5 * e[0]


def test_skew_zero_matches_constant_offset_stamp():
    d = sim(0.02, 0.0)
    assert filter_rms(S, *d, td0_hat=0.02) < filter_rms(S, *d)


def test_fit_recovers_offset_with_motion():
    d = sim(0.02, 0.0, T=40)
    td, sk = estimate_sync(S, *d[:4], fit_skew=False)
    assert abs(td - 0.02) < 0.004 and sk == 0.0


def test_skew_fit_recovers_skew_and_error():
    d = sim(0.0, 1e-3, T=40)
    td, sk = estimate_sync(S, *d[:4])
    assert abs(sk - 1e-3) < 2e-4
    assert filter_rms(S, *d, td0_hat=td, skew_hat=sk) < 0.6 * filter_rms(S, *d)


def test_fit_fails_without_motion():
    s = replace(S, omega_rms=0.3)
    errs = [abs(estimate_sync(s, *sim(0.02, 0.0, k, 40, s)[:4], fit_skew=False)[0] - 0.02) for k in range(4)]
    assert max(errs) > 0.01
