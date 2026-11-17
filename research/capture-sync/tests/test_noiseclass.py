"""Step 3d: the blind noise-class features and the conformal novelty refusal."""
import numpy as np
from capture_sync.gate import frame_kurtosis, spectral_flatness_db, Novelty, binned_ltt


def test_kurtosis_ranks_clicks_above_steady_noise():
    rng = np.random.default_rng(0)
    steady = rng.standard_normal(32000)
    clicks = 0.05 * rng.standard_normal(32000)
    for k in range(0, 32000, 6000):
        clicks[k:k + 200] += rng.standard_normal(200) * 5
    assert frame_kurtosis(clicks) > frame_kurtosis(steady) + 0.5


def test_flatness_is_near_zero_db_for_white_and_low_for_a_tone():
    rng = np.random.default_rng(1)
    t = np.arange(32000) / 16000
    assert spectral_flatness_db(rng.standard_normal(32000)) > -1.5
    assert spectral_flatness_db(np.sin(2 * np.pi * 440 * t) + 1e-3 * rng.standard_normal(32000)) < -15


def test_novelty_refuses_about_q_in_distribution_and_most_far_points():
    rng = np.random.default_rng(2)
    cal = rng.standard_normal((4000, 3))
    nov = Novelty(cal, np.arange(4000) % 2 == 0, k=5, q=0.05)
    inside = nov.inside(rng.standard_normal((20000, 3))).mean()
    assert 0.92 < inside < 0.98
    assert nov.inside(rng.standard_normal((1000, 3)) + 6.0).mean() < 0.01


def test_binned_ltt_abstains_in_a_bad_bin_and_accepts_in_a_good_one():
    rng = np.random.default_rng(3)
    n = 4000
    bins = np.repeat([0, 1], n)
    score = rng.uniform(2, 100, 2 * n)
    bad = np.r_[np.zeros(n, bool), rng.random(n) < 0.5]
    lams = binned_ltt(score, bad, bins, 2, np.geomspace(2, 400, 241))
    assert lams[0] <= 3 and lams[1] == float("inf")


def test_committed_step3d_replays_step3c_and_passes_its_check():
    import json
    import os
    path = os.path.join(os.path.dirname(__file__), "..", "experiments", "gate", "noiseclass_summary.json")
    s = json.load(open(path))
    assert s["replay_equal"] == [62, 62]
    for rt in ("0.2", "0.8"):
        kept, fail, n = s["T0"][rt]["class|0.25"]
        assert n > 0 and fail <= 0.01
