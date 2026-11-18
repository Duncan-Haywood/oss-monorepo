import math

import numpy as np
from capture_sync.gate import min_accept, binom_cdf, ltt_threshold, naive_threshold, apply_gate


def test_binom_cdf_matches_direct_sum():
    m, p = 30, 0.07
    for k in (0, 3, 10, 29):
        direct = sum(math.comb(m, i) * p ** i * (1 - p) ** (m - i) for i in range(k + 1))
        assert abs(binom_cdf(k, m, p) - direct) < 1e-12
    assert binom_cdf(-1, 5, 0.1) == 0.0 and binom_cdf(5, 5, 0.1) == 1.0


def test_binom_cdf_large_m_is_finite():
    v = binom_cdf(50, 10000, 0.01)  # mean 100: far in the lower tail
    assert 0.0 < v < 1e-5


def _sample(n, seed):
    # failure probability falls with the score: P(bad | s) = 0.3 exp(-s / 5)
    rng = np.random.default_rng(seed)
    s = rng.exponential(10.0, n)
    bad = rng.random(n) < 0.3 * np.exp(-s / 5)
    return s, bad


def test_ltt_controls_failure_among_accepted_with_probability_1_minus_delta():
    grid = np.geomspace(0.5, 100, 200)
    s_big, b_big = _sample(400_000, 99)
    viol = 0
    for seed in range(60):
        s, b = _sample(3000, seed)
        lam = ltt_threshold(s, b, grid, alpha=0.02, delta=0.1)
        if np.isfinite(lam):
            keep = s_big >= lam
            viol += b_big[keep].mean() > 0.02
    assert viol / 60 <= 0.2  # bound is 0.1; slack for 60 repeats


def test_ltt_is_stricter_than_naive_and_abstains_when_hopeless():
    grid = np.geomspace(0.5, 100, 200)
    s, b = _sample(3000, 5)
    assert ltt_threshold(s, b, grid, 0.02, 0.1) >= naive_threshold(s, b, grid, 0.02)
    allbad = np.ones(100, bool)
    assert ltt_threshold(np.arange(100.0), allbad, grid, 0.01, 0.1) == float("inf")


def test_apply_gate():
    kept, fk, n = apply_gate([1, 2, 3, 4], [True, False, True, False], 3)
    assert (kept, fk, n) == (0.5, 0.5, 2)
    assert np.isnan(apply_gate([1, 2], [0, 0], 9)[1])


def test_min_accept_is_where_zero_failures_first_reject():
    m = min_accept(0.01, 0.1)
    assert m == 230
    assert binom_cdf(0, m, 0.01) <= 0.1 < binom_cdf(0, m - 1, 0.01)


def test_sparse_top_scores_do_not_end_the_sequence():
    # a few very high scores with no failure used to stop the walk at the strictest threshold
    rng = np.random.default_rng(1)
    s = np.concatenate([rng.uniform(50, 60, 20000), [300.0, 350.0, 390.0]])
    bad = np.zeros(len(s), bool)
    bad[:100] = True  # 0.5% failures, all at moderate scores
    lam = ltt_threshold(s, bad, np.geomspace(2, 400, 241), 0.01, 0.1)
    assert lam < 60


def test_blind_snr_falls_with_added_noise():
    from capture_sync.gate import blind_snr_db
    rng = np.random.default_rng(0)
    t = np.arange(32000) / 16000
    speechy = np.sin(2 * np.pi * 300 * t) * (np.sin(2 * np.pi * 2 * t) > 0)  # on/off bursts
    clean = blind_snr_db(speechy + 1e-3 * rng.standard_normal(len(t)))
    noisy = blind_snr_db(speechy + 0.5 * rng.standard_normal(len(t)))
    assert clean > 30 and noisy < 10 and clean > noisy


def test_mondrian_refuses_out_of_support_and_controls_each_bin():
    from capture_sync.gate import mondrian_ltt, mondrian_accept
    rng = np.random.default_rng(1)
    n = 200_000
    feat = rng.uniform(0, 30, n)  # noise feature: low = noisy
    s = rng.exponential(10.0, n)
    p_bad = np.clip(0.4 * np.exp(-s / 5) * np.exp(-feat / 10), 0, 1)
    bad = rng.random(n) < p_bad
    grid = np.geomspace(0.5, 100, 200)
    floor, inner, lams = mondrian_ltt(s, bad, feat, grid, 0.01, 0.1)
    assert len(lams) == 4 and lams[0] >= lams[-1]  # noisier bin needs a stricter threshold
    ft = rng.uniform(-10, 30, n)  # test reaches below the calibration's support
    st = rng.exponential(10.0, n)
    bt = rng.random(n) < np.clip(0.4 * np.exp(-st / 5) * np.exp(-ft / 10), 0, 1)
    acc = mondrian_accept(st, ft, floor, inner, lams)
    assert not acc[ft < floor].any()
    for k in range(4):
        lo = floor if k == 0 else inner[k - 1]
        hi = inner[k] if k < 3 else np.inf
        m = acc & (ft >= lo) & (ft < hi)
        assert bt[m].mean() <= 0.012
