"""Step 3f: the geometry and sign conventions of shared noise."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments", "gate"))
import noiseshared as NS  # noqa: E402
from capture_sync.sync import FS, gcc  # noqa: E402


def test_path_difference_is_bounded_by_separation():
    rng = np.random.default_rng(0)
    for D in NS.SEPS:
        dd = [NS.path_diff_s(rng.uniform(-1, 1, 2), D) for _ in range(2000)]
        assert max(abs(x) for x in dd) <= D / NS.C_SOUND + 1e-12
    # a source on the axis beyond device b reaches b first by exactly D / c
    assert np.isclose(NS.path_diff_s([1.0, 0.0], 10.0), -10.0 / NS.C_SOUND)


def test_shared_noise_alone_locks_at_its_own_lag():
    """With only shared noise, err (speech truth) equals the relative lag, so err + ds = dn (clock truth)."""
    rng = np.random.default_rng(1)
    n, G = 2 * FS, int(NS.SEARCH * FS)
    need = n + 2 * G + 2 * int(NS.PRIOR * FS) + 400
    z = rng.standard_normal(need + 2 * NS.MARGIN + 10)
    h = np.zeros(4)
    h[0] = 1.0
    p0 = int(NS.PRIOR * FS) + G + 100
    for lag in (-700, 0, 53, 900):
        na, nb = NS.shared_tracks(z, h, h, lag, need)
        a = na[p0:p0 + n]
        b = nb[p0 - G:p0 - G + n + 2 * G]  # us = 0, so k_true = G
        d, _ = gcc(a, b, gamma=0.25, max_lag_s=NS.SEARCH, centre_s=NS.SEARCH)
        assert abs((d - G / FS) - lag / FS) < 0.5 / FS, (lag, d - G / FS)
