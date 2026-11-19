"""Step 3j: fn against plain GCC on the real LibriWASN phones (the parts testable without the recordings)."""
import os
import sys

import numpy as np

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "real-devices"))
import noisereal as N  # noqa: E402


def test_loads_step_one_not_the_gate_run_module():
    # experiments/gate/run.py shadows step 1's run.py on sys.path; the replay must use step 1's constants
    assert N.S1.PHONES == ["Nexus", "Pixel6a", "Pixel6b", "Pixel7", "Xiaomi"]
    assert N.S1.SNRS == [None, 0.0, -10.0] and 2.0 in N.S1.WINS
    assert (N.FRAME, N.PRIOR, N.SEARCH) == (1 / 30, 1.0, 1.5)


def test_spearman_is_rank_only():
    x = np.array([0.1, 0.5, 0.2, 0.9])
    assert N.spearman(x, x ** 3) == 1.0
    assert abs(N.spearman(x, -x) + 1.0) < 1e-12


def test_both_estimators_find_a_known_delay():
    rng = np.random.default_rng(0)
    fs, G = N.FS, int(N.SEARCH * N.FS)
    s = rng.standard_normal(fs * 6)
    n, k = int(N.L * fs), 4000  # true lag 0.25 s from the centre of the search stretch
    o = 2 * fs
    a = s[o:o + n]
    b = s[o - G + k:o - G + k + n + 2 * G]
    d, p, dn, pn = N.both(a, b)
    # a starts at index G - k of b, so gcc's delay on the search axis is (G - k) / fs
    for x in (d, dn):
        assert abs(x - (G - k) / fs) < 1e-3
