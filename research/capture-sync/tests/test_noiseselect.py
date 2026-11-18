"""Step 3i: the kurtosis threshold that picks plain or envelope-normalised GCC per window."""
import os
import sys

import numpy as np

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "gate"))
from noiseselect import fit_kstar  # noqa: E402
from capture_sync.gate import frame_kurtosis  # noqa: E402


def test_fit_kstar_splits_where_the_better_estimator_changes():
    # plain fails on high-kurtosis windows, fn on low ones: the threshold lands between them
    kurt = np.r_[np.linspace(0.1, 0.9, 50), np.linspace(1.5, 2.5, 50)]
    bad_plain = kurt > 1.2
    bad_fn = kurt < 1.2
    k = fit_kstar(kurt, bad_plain, bad_fn)
    assert 0.9 <= k < 1.5
    assert not np.any(np.where(kurt > k, bad_fn, bad_plain))


def test_fit_kstar_ties_go_low_and_all_fn_when_fn_never_worse():
    kurt = np.linspace(0, 1, 101)
    bad_plain = np.ones(101, bool)
    bad_fn = np.zeros(101, bool)
    k = fit_kstar(kurt, bad_plain, bad_fn)
    assert k == kurt.min()  # only the minimum itself stays with plain
    assert np.sum(kurt > k) == 100


def test_kurtosis_separates_clicks_from_a_steady_floor():
    rng = np.random.default_rng(1)
    steady = rng.standard_normal(32000)
    clicks = steady.copy()
    for t in range(1000, 31000, 3700):
        clicks[t:t + 40] += 300 * rng.standard_normal(40)
    assert frame_kurtosis(clicks) > frame_kurtosis(steady) + 0.3  # 0.80 against 0.44 (log10)
