"""Step 4c: the multi-recording consistency step recovers offsets from noisy pairwise estimates."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from capture_sync import consistency as C  # noqa: E402

F = 1 / 30


def _est(t, noise=0.002, seed=0):
    rng = np.random.default_rng(seed)
    n = len(t)
    e = np.full((n, n), np.nan)
    for i in range(n):
        for j in range(i + 1, n):
            e[i, j] = t[j] - t[i] + rng.normal(0, noise)
    return e


def test_clean_pairs_all_methods_agree():
    t = np.array([0.0, 0.31, -0.7, 1.2])
    e = _est(t)
    conf = np.ones_like(e)
    for got in (C.direct(e), C.mst(e, conf), C.trim(e, F)[0]):
        assert np.all(np.abs(got - t) < 0.01)
    flag = C.trim(e, F)[1]
    assert list(flag) == [False, True, True, True]


def test_trim_removes_one_wrong_anchor_pair():
    t = np.array([0.0, 0.31, -0.7, 1.2])
    e = _est(t)
    e[0, 2] += 0.9  # the anchor's own pair with device 2 jumped to a wrong peak
    assert abs(C.direct(e)[2] - t[2]) > 0.5
    got, flag, kept = C.trim(e, F)
    assert np.all(np.abs(got - t) < 0.01) and kept == 5 and flag[1:].all()


def test_mst_skips_the_low_confidence_wrong_pair():
    t = np.array([0.0, 0.31, -0.7, 1.2])
    e = _est(t)
    e[0, 2] += 0.9
    conf = np.ones_like(e)
    conf[0, 2] = 0.1
    assert np.all(np.abs(C.mst(e, conf) - t) < 0.01)


def test_two_wrong_pairs_on_one_device_are_not_flagged_as_consistent():
    t = np.array([0.0, 0.31, -0.7, 1.2])
    e = _est(t)
    e[0, 3] += 0.8
    e[1, 3] -= 0.5
    e[2, 3] += 1.1  # every pair with device 3 is wrong: it has no closed loop
    got, flag, _ = C.trim(e, F)
    assert np.all(np.abs(got[:3] - t[:3]) < 0.01)
    assert flag[1] and flag[2] and not flag[3]


def test_missing_pairs_disconnect_and_give_nan():
    e = _est(np.array([0.0, 0.2, 0.4]))
    e[0, 2] = e[1, 2] = np.nan
    t, flag, _ = C.trim(e, F)
    assert np.isnan(t).all() and not flag.any()
    assert np.isnan(C.mst(e, np.ones_like(e))[2])
